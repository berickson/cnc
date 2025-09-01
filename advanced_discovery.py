#!/usr/bin/env python3
"""
Advanced UDP broadcast diagnostics for macOS
Tests multiple approaches to receive broadcasts from CNC device
"""

import socket
import json
import time
import threading
import subprocess

def get_local_ip():
    """Get the local IP address"""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80))
        local_ip = s.getsockname()[0]
        s.close()
        return local_ip
    except Exception:
        s.close()
        return '192.168.86.32'

def test_broadcast_reception(bind_ip, port, name, timeout=15):
    """Test UDP broadcast reception with different binding methods"""
    print(f"\n=== Testing {name} ===")
    print(f"Binding to: {bind_ip}:{port}")
    
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        
        # Try to enable broadcast reception
        try:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
            print("✓ SO_BROADCAST enabled")
        except:
            print("⚠️  SO_BROADCAST not available")
        
        sock.bind((bind_ip, port))
        sock.settimeout(timeout)
        
        print(f"✓ Successfully bound to {bind_ip}:{port}")
        print("📡 Listening for broadcasts...")
        
        start_time = time.time()
        received_count = 0
        
        while time.time() - start_time < timeout:
            try:
                data, addr = sock.recvfrom(1024)
                received_count += 1
                print(f"📦 [{received_count}] Received from {addr}: {data[:100]}...")
                
                try:
                    json_data = json.loads(data.decode('utf-8'))
                    print(f"   📋 JSON: {json_data}")
                except:
                    print(f"   📄 Raw: {data.decode('utf-8', errors='ignore')}")
                    
            except socket.timeout:
                print(".", end="", flush=True)
                continue
            except Exception as e:
                print(f"❌ Receive error: {e}")
                break
        
        sock.close()
        print(f"\n✓ Test completed - received {received_count} packets")
        return received_count > 0
        
    except Exception as e:
        print(f"❌ Bind failed: {e}")
        return False

def test_tcpdump_capture():
    """Use tcpdump to capture UDP traffic on port 1234"""
    print(f"\n=== Testing tcpdump capture ===")
    try:
        # Run tcpdump for 10 seconds to see if any UDP traffic exists
        cmd = ['sudo', 'tcpdump', '-i', 'any', '-n', 'udp', 'port', '1234', '-c', '5']
        print(f"Running: {' '.join(cmd)}")
        print("(This will show if ANY UDP traffic exists on port 1234)")
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
        
        if result.stdout:
            print("📦 tcpdump output:")
            print(result.stdout)
        else:
            print("❌ No UDP traffic captured on port 1234")
            
        if result.stderr:
            print("⚠️  tcpdump stderr:")
            print(result.stderr)
            
    except subprocess.TimeoutExpired:
        print("⏱️  tcpdump timeout - no packets in 15 seconds")
    except Exception as e:
        print(f"❌ tcpdump failed: {e}")

def test_ping_cnc():
    """Test connectivity to the known CNC device"""
    print(f"\n=== Testing CNC connectivity ===")
    cnc_ip = "192.168.86.23"
    
    try:
        result = subprocess.run(['ping', '-c', '3', cnc_ip], 
                              capture_output=True, text=True, timeout=10)
        if result.returncode == 0:
            print(f"✅ CNC device {cnc_ip} is reachable")
        else:
            print(f"❌ CNC device {cnc_ip} not reachable")
            print(result.stderr)
    except Exception as e:
        print(f"❌ Ping test failed: {e}")

def main():
    local_ip = get_local_ip()
    print(f"🖥️  Local IP: {local_ip}")
    print(f"🎯 Target CNC: 192.168.86.23")
    
    # Test different binding approaches
    tests = [
        (local_ip, 1234, "Specific Interface (macOS fix)"),
        ("0.0.0.0", 1234, "INADDR_ANY (traditional)"),
        ("", 1234, "Empty string bind"),
    ]
    
    results = []
    for bind_ip, port, name in tests:
        success = test_broadcast_reception(bind_ip, port, name, timeout=10)
        results.append((name, success))
    
    # Test network connectivity
    test_ping_cnc()
    
    # Try packet capture if available
    test_tcpdump_capture()
    
    # Summary
    print(f"\n=== SUMMARY ===")
    for name, success in results:
        status = "✅ SUCCESS" if success else "❌ FAILED"
        print(f"{status} - {name}")
    
    print(f"\n💡 Next steps:")
    print(f"   1. Verify CNC is broadcasting (check with Wireshark)")
    print(f"   2. Check if firewall is blocking UDP port 1234")
    print(f"   3. Try direct TCP connection to 192.168.86.23:8080")

if __name__ == "__main__":
    main()
