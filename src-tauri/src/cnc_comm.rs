use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::net::{Ipv4Addr, TcpStream, UdpSocket};
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CncDevice {
    pub name: String,
    pub ip: String,
    pub port: u16,
    pub mac: Option<String>,
    pub firmware: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CncConnection {
    pub device: CncDevice,
    pub connected: bool,
}

// Structure for UDP broadcast response from Genmitsu WiFi module
#[derive(Debug, Deserialize)]
struct GenmitsuBroadcast {
    ip: String,
    port: String, // Port comes as string from device
    name: String,
    uuid: String, // MAC address in uuid field
}

pub struct CncManager {
    current_connection: Option<TcpStream>,
    device_info: Option<CncDevice>,
}

impl CncManager {
    pub fn new() -> Self {
        Self {
            current_connection: None,
            device_info: None,
        }
    }

    /// Discover CNC devices - now uses proper multicast discovery
    pub fn discover_devices(&self, timeout_ms: u64) -> Result<Vec<CncDevice>> {
        let mut devices = Vec::new();

        // First try multicast discovery (the correct method!)
        println!("� Attempting multicast discovery on 224.0.0.251:1234...");
        match self.multicast_discovery(timeout_ms) {
            Ok(mut multicast_devices) => {
                if !multicast_devices.is_empty() {
                    println!(
                        "✅ Found {} device(s) via multicast",
                        multicast_devices.len()
                    );
                    devices.append(&mut multicast_devices);
                    return Ok(devices);
                }
            }
            Err(e) => {
                println!("⚠️  Multicast discovery failed: {}", e);
            }
        }

        // Fallback: Direct TCP connection to known IP
        println!("🔄 Falling back to direct TCP connection...");
        let cnc_ip = "192.168.86.23";
        let cnc_port = 10086;

        match self.probe_device(cnc_ip, cnc_port) {
            Ok(mut device) => {
                println!("✅ Found CNC device via direct connection!");
                device.name = "Genmitsu CNC (Direct)".to_string();
                devices.push(device);
            }
            Err(e) => {
                println!("❌ Direct connection also failed: {}", e);
            }
        }

        Ok(devices)
    }

    /// Multicast discovery using mDNS multicast group 224.0.0.251
    fn multicast_discovery(&self, timeout_ms: u64) -> Result<Vec<CncDevice>> {
        let mut devices = Vec::new();

        // Create UDP socket
        let socket = UdpSocket::bind("0.0.0.0:1234")?;
        socket.set_read_timeout(Some(Duration::from_millis(timeout_ms)))?;

        // Join multicast group 224.0.0.251 (mDNS)
        let multicast_addr = Ipv4Addr::new(224, 0, 0, 251);
        let interface_addr = Ipv4Addr::UNSPECIFIED;
        socket.join_multicast_v4(&multicast_addr, &interface_addr)?;

        println!("📡 Joined multicast group 224.0.0.251, listening for CNC devices...");

        let start_time = std::time::Instant::now();
        let mut buf = [0; 1024];

        while start_time.elapsed() < Duration::from_millis(timeout_ms) {
            match socket.recv_from(&mut buf) {
                Ok((size, addr)) => {
                    let data = &buf[..size];
                    match std::str::from_utf8(data) {
                        Ok(json_str) => {
                            println!("📨 Received multicast from {}: {}", addr, json_str);
                            match serde_json::from_str::<GenmitsuBroadcast>(json_str) {
                                Ok(broadcast) => {
                                    println!("🎯 Parsed Genmitsu device: {}", broadcast.name);

                                    // Convert port string to u16
                                    let port = broadcast.port.parse::<u16>().unwrap_or(10086);

                                    // Probe the device to verify it's actually a CNC
                                    if let Ok(mut device) = self.probe_device(&broadcast.ip, port) {
                                        device.name = broadcast.name;
                                        device.mac = Some(broadcast.uuid);
                                        devices.push(device);
                                        
                                        // 🚀 SPEED IMPROVEMENT: Return immediately after first valid device
                                        println!("✅ Found valid CNC device, connecting immediately!");
                                        break;
                                    }
                                }
                                Err(e) => {
                                    println!("Failed to parse JSON: {}", e);
                                }
                            }
                        }
                        Err(e) => {
                            println!("Received non-UTF8 data: {:?}", e);
                        }
                    }
                }
                Err(e) => {
                    if e.kind() == std::io::ErrorKind::TimedOut {
                        break;
                    }
                    println!("Multicast receive error: {}", e);
                }
            }
        }

        // Leave multicast group
        socket.leave_multicast_v4(&multicast_addr, &interface_addr)?;

        Ok(devices)
    }

    /// Probe a specific IP and port to see if it's a CNC device
    fn probe_device(&self, ip: &str, port: u16) -> Result<CncDevice> {
        let addr = format!("{}:{}", ip, port);

        // Try to connect with a shorter timeout for faster discovery
        match TcpStream::connect_timeout(&addr.parse()?, Duration::from_millis(1000)) {
            Ok(mut stream) => {
                stream.set_read_timeout(Some(Duration::from_millis(1000)))?;
                stream.set_write_timeout(Some(Duration::from_millis(500)))?;

                // Send Grbl status query
                let _ = stream.write_all(b"?\n");

                let mut buffer = [0; 512];
                let mut response = String::new();

                if let Ok(size) = stream.read(&mut buffer) {
                    response = String::from_utf8_lossy(&buffer[..size]).to_string();
                }

                // Check if response looks like Grbl
                if response.contains("Idle")
                    || response.contains("Alarm")
                    || response.contains("Run")
                    || response.contains("MPos")
                    || response.contains("VER:")
                {
                    // Skip firmware version check for faster connection
                    // We can get this info later if needed
                    Ok(CncDevice {
                        name: format!("CNC at {}", ip),
                        ip: ip.to_string(),
                        port,
                        mac: None,
                        firmware: None, // Skip version check for speed
                    })
                } else {
                    Err(anyhow!(
                        "Not a CNC device - unexpected response: {}",
                        response
                    ))
                }
            }
            Err(e) => Err(anyhow!("Connection failed: {}", e)),
        }
    }

    /// Extract firmware information from response
    /// Connect to a specific CNC device
    pub fn connect(&mut self, device: &CncDevice) -> Result<()> {
        let addr = format!("{}:{}", device.ip, device.port);
        let stream = TcpStream::connect_timeout(&addr.parse()?, Duration::from_millis(5000))?;

        // Set timeouts
        stream.set_read_timeout(Some(Duration::from_millis(5000)))?;
        stream.set_write_timeout(Some(Duration::from_millis(1000)))?;

        self.current_connection = Some(stream);
        self.device_info = Some(device.clone());

        // Initialize connection - send wake up command
        let _ = self.send_command("?");

        Ok(())
    }

    /// Send a command to the connected CNC
    pub fn send_command(&mut self, command: &str) -> Result<String> {
        if let Some(ref mut stream) = self.current_connection {
            let cmd_with_newline = format!("{}\n", command);
            stream.write_all(cmd_with_newline.as_bytes())?;

            let mut buffer = [0; 1024];
            let size = stream.read(&mut buffer)?;
            let response = String::from_utf8_lossy(&buffer[..size]).to_string();

            Ok(response.trim().to_string())
        } else {
            Err(anyhow!("Not connected to any device"))
        }
    }

    /// Disconnect from current device
    pub fn disconnect(&mut self) {
        self.current_connection = None;
        self.device_info = None;
    }

    /// Send jog command
    pub fn jog(&mut self, axis: &str, distance: f32, feed_rate: u32) -> Result<String> {
        let command = format!("$J=G91{}{}F{}", axis, distance, feed_rate);
        self.send_command(&command)
    }

    /// Get machine status
    pub fn get_status(&mut self) -> Result<String> {
        self.send_command("?")
    }

    /// Home the machine
    pub fn home(&mut self) -> Result<String> {
        self.send_command("$H")
    }

    /// Reset/unlock the machine
    pub fn reset(&mut self) -> Result<String> {
        self.send_command("\x18") // Ctrl-X
    }

    /// Set work coordinate system zero
    pub fn set_work_zero(&mut self, axes: &str) -> Result<String> {
        let command = format!("G10L20P1{}", axes);
        self.send_command(&command)
    }
}
