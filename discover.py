import socket
import struct
import json

sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)

# Join the multicast group
mreq = struct.pack("4sl", socket.inet_aton("224.0.0.251"), socket.INADDR_ANY)
sock.setsockopt(socket.IPPROTO_IP, socket.IP_ADD_MEMBERSHIP, mreq)

sock.bind(('', 1234))
sock.settimeout(10)

print("Listening for multicast broadcasts...")
try:
    data, addr = sock.recvfrom(1024)
    module_info = json.loads(data.decode())
    print(f"Found module: {module_info}")
except socket.timeout:
    print("No broadcasts received")
finally:
    sock.close()