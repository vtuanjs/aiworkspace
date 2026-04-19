// Native browser child-webview management + HTTP relay for devtools data.

use std::io::{Read, Write};
use std::net::TcpListener;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewBuilder, WebviewUrl};

pub const RELAY_PORT: u16 = 9482;
const BROWSER_LABEL: &str = "monocode-browser";

/// Injected into every page loaded by the child webview (before any page JS runs).
/// Sends console/network/storage/navigate events to the local HTTP relay so the
/// React frontend can display them. URL navigation is handled by the React toolbar.
const INIT_SCRIPT: &str = r#"(function(){
if(window.__monocode)return;
window.__monocode=true;
var P=9482;
var s=function(d){
  fetch('http://127.0.0.1:'+P+'/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)}).catch(function(){});
};

// ── Devtools relay ────────────────────────────────────────────────────────────
var nav=function(){s({type:'navigate',url:location.href,title:document.title,timestamp:Date.now()});};
nav();
window.addEventListener('hashchange',nav);
window.addEventListener('popstate',nav);
['log','info','warn','error'].forEach(function(l){
  var o=console[l];
  console[l]=function(){
    o.apply(console,arguments);
    var m=Array.from(arguments).map(function(a){try{return typeof a==='object'?JSON.stringify(a):String(a);}catch(_){return String(a);}}).join(' ');
    s({type:'console',level:l,message:m,timestamp:Date.now()});
  };
});
window.addEventListener('error',function(e){s({type:'console',level:'error',message:e.message+(e.filename?' \u2014 '+e.filename+':'+e.lineno:''),timestamp:Date.now()});});
window.addEventListener('unhandledrejection',function(e){s({type:'console',level:'error',message:'Unhandled: '+String(e.reason),timestamp:Date.now()});});
var of=window.fetch;
window.fetch=function(input,init){
  var method=((init&&init.method)||'GET').toUpperCase();
  var url=typeof input==='string'?input:(input instanceof Request?input.url:String(input));
  if(url.indexOf('127.0.0.1:'+P)>-1)return of.apply(this,arguments);
  var t=Date.now();
  return of.apply(this,arguments).then(
    function(r){s({type:'network',method:method,url:url,status:r.status,statusText:r.statusText,duration:Date.now()-t,requestType:'fetch',timestamp:t});return r;},
    function(e){s({type:'network',method:method,url:url,status:0,statusText:'Error',duration:Date.now()-t,requestType:'fetch',timestamp:t,error:String(e)});throw e;}
  );
};
var oo=XMLHttpRequest.prototype.open,os=XMLHttpRequest.prototype.send;
XMLHttpRequest.prototype.open=function(m,u){this.__m=m;this.__u=u;this.__t=Date.now();return oo.apply(this,arguments);};
XMLHttpRequest.prototype.send=function(){
  var self=this;
  this.addEventListener('loadend',function(){s({type:'network',method:(self.__m||'GET').toUpperCase(),url:self.__u||'',status:self.status,statusText:self.statusText,duration:Date.now()-(self.__t||Date.now()),requestType:'xhr',timestamp:self.__t||Date.now()});});
  return os.apply(this,arguments);
};
var snap=function(){
  var ls={},ss={};
  try{for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);ls[k]=localStorage.getItem(k);}}catch(_){}
  try{for(var i=0;i<sessionStorage.length;i++){var k=sessionStorage.key(i);ss[k]=sessionStorage.getItem(k);}}catch(_){}
  s({type:'storage',localStorage:ls,sessionStorage:ss,timestamp:Date.now()});
};
snap();
window.addEventListener('storage',snap);
})();"#;

// ── HTTP relay ────────────────────────────────────────────────────────────────

/// Start a minimal HTTP server that receives POST requests from INIT_SCRIPT
/// and re-emits them as Tauri events to the React frontend.
pub fn run_browser_relay(app_handle: AppHandle) {
    let listener = match TcpListener::bind(format!("127.0.0.1:{}", RELAY_PORT)) {
        Ok(l) => l,
        Err(e) => {
            eprintln!("[browser_relay] bind failed on port {}: {}", RELAY_PORT, e);
            return;
        }
    };
    for stream in listener.incoming() {
        if let Ok(stream) = stream {
            let handle = app_handle.clone();
            std::thread::spawn(move || handle_relay_connection(stream, handle));
        }
    }
}

fn handle_relay_connection(mut stream: std::net::TcpStream, app_handle: AppHandle) {
    let mut buf = vec![0u8; 65536];
    let n = match stream.read(&mut buf) {
        Ok(n) if n > 0 => n,
        _ => return,
    };
    let raw = match std::str::from_utf8(&buf[..n]) {
        Ok(s) => s.to_string(),
        Err(_) => return,
    };

    // CORS + Private Network Access headers (needed for fetch from public sites → localhost)
    let cors = concat!(
        "Access-Control-Allow-Origin: *\r\n",
        "Access-Control-Allow-Methods: POST, OPTIONS\r\n",
        "Access-Control-Allow-Headers: Content-Type\r\n",
        "Access-Control-Allow-Private-Network: true\r\n",
    );

    if raw.starts_with("OPTIONS") {
        let _ = stream.write_all(
            format!("HTTP/1.1 204 No Content\r\n{}Content-Length: 0\r\n\r\n", cors).as_bytes(),
        );
        return;
    }

    // Parse JSON body (after the blank line separating HTTP headers from body)
    if let Some(pos) = raw.find("\r\n\r\n") {
        let body = raw[pos + 4..].trim();
        if !body.is_empty() {
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(body) {
                let _ = app_handle.emit("browser:data", value);
            }
        }
    }

    let _ = stream.write_all(
        format!("HTTP/1.1 200 OK\r\n{}Content-Length: 0\r\n\r\n", cors).as_bytes(),
    );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn parse_url(raw: &str) -> Result<url::Url, String> {
    let normalized = if raw.starts_with("http://") || raw.starts_with("https://") {
        raw.to_string()
    } else {
        format!("https://{}", raw)
    };
    normalized.parse::<url::Url>().map_err(|e| e.to_string())
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/// add_child / set_position coordinates are relative to the window's OUTER frame,
/// but getBoundingClientRect() values are relative to the content area (below the
/// native title bar). Compute the gap so callers can add it to the y coordinate.
fn title_bar_height(window: &tauri::Window) -> i32 {
    let inner = window.inner_position().unwrap_or_default();
    let outer = window.outer_position().unwrap_or_default();
    (inner.y - outer.y).max(0)
}

// ── Tauri commands ────────────────────────────────────────────────────────────

/// Open the browser as a child webview embedded in the main window.
/// x, y, width, height are PHYSICAL pixels (CSS pixels × devicePixelRatio from JS).
#[tauri::command]
pub fn browser_open(
    app: AppHandle,
    url: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let parsed = parse_url(&url)?;

    let main_window = app
        .get_window("main")
        .ok_or("main window not found")?;

    // y from JS is relative to the content area; shift by title bar height so the
    // child webview is positioned relative to the window outer frame (Tauri's origin).
    let tb = title_bar_height(&main_window);
    let pos = PhysicalPosition::new(x.round() as i32, y.round() as i32 + tb);
    let size = PhysicalSize::new(width.round() as u32, height.round() as u32);

    if let Some(existing) = app.get_webview(BROWSER_LABEL) {
        existing.set_position(pos).map_err(|e| e.to_string())?;
        existing.set_size(size).map_err(|e| e.to_string())?;
        existing.navigate(parsed).map_err(|e| e.to_string())
    } else {
        main_window
            .add_child(
                WebviewBuilder::new(BROWSER_LABEL, WebviewUrl::External(parsed))
                    .initialization_script(INIT_SCRIPT),
                pos,
                size,
            )
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
}

/// Update the position and size of the browser webview.
/// x, y, width, height are PHYSICAL pixels (CSS pixels × devicePixelRatio from JS).
#[tauri::command]
pub fn browser_set_bounds(
    app: AppHandle,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    if let Some(wv) = app.get_webview(BROWSER_LABEL) {
        let tb = app.get_window("main").map(|w| title_bar_height(&w)).unwrap_or(0);
        wv.set_position(PhysicalPosition::new(x.round() as i32, y.round() as i32 + tb))
            .map_err(|e| e.to_string())?;
        wv.set_size(PhysicalSize::new(width.round() as u32, height.round() as u32))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Close (remove) the browser webview.
#[tauri::command]
pub fn browser_close(app: AppHandle) -> Result<(), String> {
    if let Some(wv) = app.get_webview(BROWSER_LABEL) {
        wv.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Navigate the browser webview back in history.
#[tauri::command]
pub fn browser_go_back(app: AppHandle) -> Result<(), String> {
    if let Some(wv) = app.get_webview(BROWSER_LABEL) {
        wv.eval("history.back()").map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Open DevTools for the browser webview.
#[tauri::command]
pub fn browser_open_devtools(app: AppHandle) -> Result<(), String> {
    if let Some(wv) = app.get_webview(BROWSER_LABEL) {
        wv.open_devtools();
    }
    Ok(())
}
