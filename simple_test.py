#!/usr/bin/env python3
"""
Simple broadcast listener with multiple fallback methods
"""

import socket
import time
import threading

def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80))
        local_ip = s.getsockname()[0]
        s.close()
        return local_ip
    except Exception:
        s.close()
        return '192.168.86.32'

def listen_method(name, bind_addr, timeout=5):
    """Test a specific binding method"""
    print(f"\n🔍 Testing: {name}")
    print(f"   Binding to: {bind_addr}")
    
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        sock.bind(bind_addr)
        sock.settimeout(timeout)
        
        print(f"   ✅ Bound successfully")
        
        start_time = time.time()
        count = 0
        while time.time() - start_time < timeout:
            try:
                data, addr = sock.recvfrom(1024)
                count += 1
                print(f"   📦 Packet {count} from {addr}: {data[:50]}...")
            except socket.timeout:
                print(".", end="", flush=True)
        
        sock.close()
        print(f"\n   📊 Received {count} packets")
        return count > 0
        
    except Exception as e:
        print(f"   ❌ Failed: {e}")
        return False

def main():
    local_ip = get_local_ip()
    print(f"🌐 Local IP: {local_ip}")
    
    # Test different methods
    methods = [
        ("macOS fix - Specific interface", (local_ip, 1234)),
        ("Traditional - INADDR_ANY", ("0.0.0.0", 1234)),
        ("Broadcast address", ("255.255.255.255", 1234)),
        ("Network broadcast", ("192.168.86.255", 1234)),
    ]
    
    results = []
    for name, addr in methods:
        try:
            success = listen_method(name, addr, timeout=3)
            results.append((name, success, "✅" if success else "❌"))
        except KeyboardInterrupt:
            print(f"\n⏹️  Interrupted during {name}")
            break
        except Exception as e:
            results.append((name, False, f"❌ {e}"))
    
    print(f"\n📋 RESULTS:")
    for name, success, status in results:
        print(f"   {status} {name}")
    
    print(f"\n💡 If no methods work, the CNC might not be broadcasting")
    print(f"   or there's a firewall/network issue blocking UDP port 1234")

if __name__ == "__main__":
    main()
