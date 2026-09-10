const radius = require('radius');
const dgram = require('dgram');
const secret = 'emmatech_radius_secret_2026';
const host = '13.140.174.60';
const port = 1812;
const packet = { code: 'Access-Request', secret: secret, identifier: 0, attributes: [['User-Name', '6JU2V5'], ['User-Password', '6JU2V5']] };
const encoded = radius.encode(packet);
const client = dgram.createSocket('udp4');
client.on('message', function(msg, rinfo) {
  const response = radius.decode({packet: msg, secret: secret});
  console.log('Received response:', response.code);
  client.close();
});
client.send(encoded, 0, encoded.length, port, host, function(err) {
  if (err) {
    console.error('Error sending packet:', err);
    client.close();
  } else {
    console.log('Packet sent to RADIUS');
  }
});
setTimeout(() => { console.log("TIMEOUT"); client.close(); }, 3000);
