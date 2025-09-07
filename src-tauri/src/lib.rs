mod cnc_comm;

use cnc_comm::{CncDevice, CncManager};
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
    // Reduced timeout since we connect to first device found
    manager.discover_devices(3000).map_err(|e| e.to_string())
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
fn jog_cnc(
    axis: String,
    distance: f32,
    feed_rate: u32,
    state: tauri::State<AppState>,
) -> Result<String, String> {
    let mut manager = state.cnc_manager.lock().map_err(|e| e.to_string())?;
    manager
        .jog(&axis, distance, feed_rate)
        .map_err(|e| e.to_string())
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
fn check_cnc_alarm_status(state: tauri::State<AppState>) -> Result<String, String> {
    let mut manager = state.cnc_manager.lock().map_err(|e| e.to_string())?;
    manager.check_alarm_status().map_err(|e| e.to_string())
}

#[tauri::command]
fn write_performance_log(message: String) -> Result<(), String> {
    use std::fs::OpenOptions;
    use std::io::Write;
    use std::time::{SystemTime, UNIX_EPOCH};
    
    let log_path = "cnc_performance.log";
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis();
    let log_entry = format!("[{}] {}\n", now, message);
    
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path)
        .map_err(|e| e.to_string())?;
    
    file.write_all(log_entry.as_bytes())
        .map_err(|e| e.to_string())?;
    
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    let app_state = AppState {
        cnc_manager: Arc::new(Mutex::new(CncManager::new())),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
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
            check_cnc_alarm_status,
            write_performance_log
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
