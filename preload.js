const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Config
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (updates) => ipcRenderer.invoke('save-config', updates),

  // Serial
  listPorts: () => ipcRenderer.invoke('list-ports'),
  connectSerial: (port, baudRate) => ipcRenderer.invoke('connect-serial', { port, baudRate }),
  disconnectSerial: () => ipcRenderer.invoke('disconnect-serial'),

  // Playback control (dashboard → main)
  playVideo1: () => ipcRenderer.send('play-video1'),
  playVideo2: () => ipcRenderer.send('play-video2'),

  // Simulation (testing without hardware)
  simulateSensor: () => ipcRenderer.send('simulate-sensor'),
  simulateRemote1: () => ipcRenderer.send('simulate-remote1'),
  simulateRemote2: () => ipcRenderer.send('simulate-remote2'),

  // Events (player → main)
  notifyVideo1Ended: () => ipcRenderer.send('video1-ended'),
  notifyVideo2Ended: () => ipcRenderer.send('video2-ended'),

  // Listen for broadcasts
  onStateUpdate: (cb) => {
    ipcRenderer.on('state-update', (event, data) => cb(data));
  },
  onSerialStatus: (cb) => {
    ipcRenderer.on('serial-status', (event, data) => cb(data));
  },
  onPortsList: (cb) => {
    ipcRenderer.on('ports-list', (event, data) => cb(data));
  },

  // Cleanup
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});
