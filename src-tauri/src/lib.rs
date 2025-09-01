mod cnc_comm;

use cnc_comm::{CncManager, CncDevice};
use std::sync::{Arc, Mutex};

// App state for sharing CNC manager across commands
struct AppState {
    cnc_manager: Arc<Mutex<CncManager>>,
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn discover_cnc_devices(state: tauri::State<AppState>) -> Result<Vec<CncDevice>, String> {
    let manager = state.cnc_manager.lock().map_err(|e| e.to_string())?;
    manager.discover_devices(5000).map_err(|e| e.to_string())
}

#[tauri::command]
fn connect_to_cnc(device: CncDevice, state: tauri::State<AppState>) -> Result<(), String> {
    let mut manager = state.cnc_manager.lock().map_err(|e| e.to_string())?;
    manager.connect(&device).map_err(|e| e.to_string())
}

#[tauri::command]
fn disconnect_cnc(state: tauri::State<AppState>) -> Result<(), String> {
    let mut manager = state.cnc_manager.lock().map_err(|e| e.to_string())?;
    manager.disconnect();
    Ok(())
}

#[tauri::command]
fn send_cnc_command(command: String, state: tauri::State<AppState>) -> Result<String, String> {
    let mut manager = state.cnc_manager.lock().map_err(|e| e.to_string())?;
    manager.send_command(&command).map_err(|e| e.to_string())
}

#[tauri::command]
fn jog_cnc(axis: String, distance: f32, feed_rate: u32, state: tauri::State<AppState>) -> Result<String, String> {
    let mut manager = state.cnc_manager.lock().map_err(|e| e.to_string())?;
    manager.jog(&axis, distance, feed_rate).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_cnc_status(state: tauri::State<AppState>) -> Result<String, String> {
    let mut manager = state.cnc_manager.lock().map_err(|e| e.to_string())?;
    manager.get_status().map_err(|e| e.to_string())
}

#[tauri::command]
fn home_cnc(state: tauri::State<AppState>) -> Result<String, String> {
    let mut manager = state.cnc_manager.lock().map_err(|e| e.to_string())?;
    manager.home().map_err(|e| e.to_string())
}

#[tauri::command]
fn reset_cnc(state: tauri::State<AppState>) -> Result<String, String> {
    let mut manager = state.cnc_manager.lock().map_err(|e| e.to_string())?;
    manager.reset().map_err(|e| e.to_string())
}

#[tauri::command]
fn set_cnc_work_zero(axes: String, state: tauri::State<AppState>) -> Result<String, String> {
    let mut manager = state.cnc_manager.lock().map_err(|e| e.to_string())?;
    manager.set_work_zero(&axes).map_err(|e| e.to_string())
}

#[tauri::command]
fn copy_to_clipboard(text: String) -> Result<(), String> {
    use std::process::Command;
    
    // Use system clipboard utilities
    #[cfg(target_os = "linux")]
    {
        let output = Command::new("xclip")
            .arg("-selection")
            .arg("clipboard")
            .stdin(std::process::Stdio::piped())
            .spawn();
            
        if let Ok(mut child) = output {
            if let Some(stdin) = child.stdin.as_mut() {
                use std::io::Write;
                let _ = stdin.write_all(text.as_bytes());
            }
            let _ = child.wait();
            return Ok(());
        }
        
        // Fallback to wl-copy for Wayland
        let output = Command::new("wl-copy")
            .arg(text)
            .output();
            
        if output.is_ok() {
            return Ok(());
        }
        
        return Err("No clipboard utility available (xclip or wl-copy)".to_string());
    }
    
    #[cfg(target_os = "windows")]
    {
        use std::ffi::OsStr;
        use std::os::windows::ffi::OsStrExt;
        
        // Windows clipboard implementation would go here
        // For now, return an error
        return Err("Windows clipboard not implemented".to_string());
    }
    
    #[cfg(target_os = "macos")]
    {
        let output = Command::new("pbcopy")
            .stdin(std::process::Stdio::piped())
            .spawn();
            
        if let Ok(mut child) = output {
            if let Some(stdin) = child.stdin.as_mut() {
                use std::io::Write;
                let _ = stdin.write_all(text.as_bytes());
            }
            let _ = child.wait();
            return Ok(());
        }
        
        return Err("pbcopy not available".to_string());
    }
}

#[tauri::command]
fn read_from_clipboard() -> Result<String, String> {
    use std::process::Command;
    
    #[cfg(target_os = "linux")]
    {
        let output = Command::new("xclip")
            .arg("-selection")
            .arg("clipboard")
            .arg("-o")
            .output();
            
        if let Ok(output) = output {
            return Ok(String::from_utf8_lossy(&output.stdout).to_string());
        }
        
        // Fallback to wl-paste for Wayland
        let output = Command::new("wl-paste")
            .output();
            
        if let Ok(output) = output {
            return Ok(String::from_utf8_lossy(&output.stdout).to_string());
        }
        
        return Err("No clipboard utility available (xclip or wl-paste)".to_string());
    }
    
    #[cfg(target_os = "windows")]
    {
        return Err("Windows clipboard not implemented".to_string());
    }
    
    #[cfg(target_os = "macos")]
    {
        let output = Command::new("pbpaste")
            .output();
            
        if let Ok(output) = output {
            return Ok(String::from_utf8_lossy(&output.stdout).to_string());
        }
        
        return Err("pbpaste not available".to_string());
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();
    
    let app_state = AppState {
        cnc_manager: Arc::new(Mutex::new(CncManager::new())),
    };
    
    tauri::Builder::default()
        .manage(app_state)
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            discover_cnc_devices,
            connect_to_cnc,
            disconnect_cnc,
            send_cnc_command,
            jog_cnc,
            get_cnc_status,
            home_cnc,
            reset_cnc,
            set_cnc_work_zero,
            copy_to_clipboard,
            read_from_clipboard
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
