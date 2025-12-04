import uibuilder from './uibuilder.esm.js'

// Start the connection to Node-RED
uibuilder.start()

// CPU Usage
// Setup Chart.js
const ctx = document.getElementById('cpuChart').getContext('2d')

// --- Load saved chart data if available ---
let saved = localStorage.getItem('cpuChartData')
let labels = []
let datasets = [
  { label: 'Core 0', data: [], borderColor: '#FF6384', tension: 0.3 },
  { label: 'Core 1', data: [], borderColor: '#36A2EB', tension: 0.3 },
  { label: 'Core 2', data: [], borderColor: '#FFCE56', tension: 0.3 },
  { label: 'Core 3', data: [], borderColor: '#4BC0C0', tension: 0.3 },
  { label: 'Overall', data: [], borderColor: '#9966FF', borderWidth: 3, tension: 0.3 }
]

if (saved) {
  try {
    const parsed = JSON.parse(saved)
    if (parsed.labels && parsed.datasets) {
      labels = parsed.labels
      // merge saved data safely
      parsed.datasets.forEach((d, i) => {
        if (datasets[i]) datasets[i].data = d.data
      })
    }
  } catch (err) {
    console.warn('Failed to parse saved chart data:', err)
  }
}

//const ctx = document.getElementById('cpuChart').getContext('2');
const cpuChart = new Chart(ctx, {
  type: 'line',
  data: { labels, datasets },
  options: {
    scales: {
      y: {
        min: 0,
        max: 100,
        ticks: {
          stepSize: 20, // Show 0, 20, 40, 60, 80, 100
          callback: value => [0, 20, 40, 60, 80, 100].includes(value) ? value : null
        },
        title: {
          display: true,
          text: 'CPU Usage (%)'
        }
      },
      x: {
        title: {
          display: true,
          text: 'Time'
        }
      }
    },
    plugins: {
      legend: { position: 'bottom' }
    },
    animation: false
  }
})
//END

// MEMORY CHART CONFIGURATION
const memCtx = document.getElementById('memoryChart').getContext('2d');

// Initialize with current time in 12-hour format
const currentTime = new Date().toLocaleTimeString('en-US', {
  hour12: true,
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit'
});

let memLabels = Array(6).fill(currentTime);
let memDatasets = [
  {
    label: 'Used',
    data: Array(6).fill(0),
    backgroundColor: 'rgba(54, 162, 235, 0.3)',
    borderColor: 'rgba(54, 162, 235, 1)',
    fill: true
  },
  {
    label: 'Cache',
    data: Array(6).fill(0),
    backgroundColor: 'rgba(255, 99, 132, 0.3)',
    borderColor: 'rgba(255, 99, 132, 1)',
    fill: true
  }
];

// Memory chart configuration
const memoryChart = new Chart(memCtx, {
  type: 'line',
  data: {
    labels: memLabels,
    datasets: memDatasets
  },
  options: {
    responsive: true,
    maintainAspectRatio: true,
    aspectRatio: 2,
    scales: {
      x: {
        grid: {
          display: false,
          drawBorder: true
        },
        title: {
          display: true,
          text: 'Time',
          font: {
            size: 14,
            weight: 'bold'
          },
          padding: { top: 10 }
        }
      },
      y: {
        min: 0,
        max: 3000,
        grid: {
          color: '#eee'
        },
        border: {
          display: true,
          width: 2,
          color: '#7a8793'
        },
        title: {
          display: true,
          text: 'Memory (MB)',
          font: {
            size: 14,  // Match CPU chart font size
          
          }
        },
        ticks: {
          stepSize: 100
        }
      }
    },
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          boxWidth: 12,
          padding: 15,
          usePointStyle: true,
          font: {
            size: 12
          }
        }
      }
    }
  }
});

// Memory handler with live time updates
uibuilder.onChange('msg', function (msg) {
  // Debug incoming message
  console.log('Message received:', msg);

  // CPU handler remains unchanged
  if (msg.payload?.cores) {
    const { cores, overall } = msg.payload;
    const timeLabel = new Date().toLocaleTimeString();

    // Limit graph history to last 5 samples
    if (labels.length >= 5) {
      labels.shift();
      datasets.forEach(d => d.data.shift());
    }

    labels.push(timeLabel);
    datasets[0].data.push(cores.core0);
    datasets[1].data.push(cores.core1);
    datasets[2].data.push(cores.core2);
    datasets[3].data.push(cores.core3);
    datasets[4].data.push(overall);

    cpuChart.update();

    // Save chart data so it persists after refresh
    localStorage.setItem('cpuChartData', JSON.stringify({
      labels,
      datasets
    }));
  }

  // Memory handler
  if (msg.payload?.memory) {
    try {
      const timeLabel = new Date().toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });

      memLabels.shift();
      memDatasets[0].data.shift();
      memDatasets[1].data.shift();

      memLabels.push(timeLabel);
      memDatasets[0].data.push(Number(msg.payload.memory.used));
      memDatasets[1].data.push(Number(msg.payload.memory.cache));

      memoryChart.update('none');
    } catch (error) {
      console.log('Memory update:', msg.payload.memory);
    }
  }
});
//END


//DISK USAGE//
// Start uibuilder connection
uibuilder.start();

// Wait until the page is ready
window.addEventListener('load', () => {
  const ctx = document.getElementById('diskPie').getContext('2d');

  // Create the chart
  const diskChart = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: ['Used', 'Free'],
      datasets: [{
        data: [0, 100],
        backgroundColor: ['#0070ac', '#6ee794'],
        borderWidth: 1
      }]
    },
   options: {
      responsive: true,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: '#000',
            font: { size: 14 },
            generateLabels: function(chart) {
              const data = chart.data;
              if (!data.labels.length) return [];

              const dataset = data.datasets[0];
              const total = dataset.data.reduce((a, b) => a + b, 0);

              return data.labels.map((label, i) => {
                const value = dataset.data[i];
                const percentage = total ? ((value / total) * 100).toFixed(1) : 0;
                const background = dataset.backgroundColor[i];

                return {
                  text: `${label} (${percentage}%)`,
                  fillStyle: background,
                  strokeStyle: background,
                  lineWidth: 2,
                  hidden: isNaN(value),
                  index: i
                };
              });
            }
          }
        },         
      }
    }
  });

  // Listen for messages from Node-RED
  uibuilder.onChange('msg', function (msg) {
    if (!msg || !msg.payload) return;

    if (msg.payload.error) {
      console.error(msg.payload.error);
      return;
    }

    if (msg.payload.labels && msg.payload.values) {
      diskChart.data.labels = msg.payload.labels;
      diskChart.data.datasets[0].data = msg.payload.values;
      diskChart.update();
    }
  });
});
//END

// EVENT LOGS OVERVIEW CHART SETUP


// Start uibuilder connection
uibuilder.start();

const statusEl = document.getElementById('status');
const tbody = document.getElementById('alertsBody');

// Show connection status
uibuilder.onChange('uibuilderStatus', (state) => {
  statusEl.textContent = Array.isArray(state) ? state.join(' | ') : String(state);
});

// Receive messages from Node-RED (msg.payload = array of alerts)
uibuilder.onChange('msg', (msg) => {
  const alerts = msg?.payload;
  if (!Array.isArray(alerts)) return;
  renderTable(alerts);
});

function renderTable(alerts) {
  tbody.innerHTML = '';
  alerts.forEach(a => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${formatTimeOnly(a.time)}</td>
      <td>${safe(a.type)}</td>
      <td>${safe(a.source)}</td>
      <td>${safe(a.destination)}</td>
      <td>${safe(a.alert)}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ---- helpers ----

// Show only time (HH:mm:ss or HH:mm depending on your preference)
function formatTimeOnly(ts) {
  // If Suricata gives ISO with timezone, Date will handle it.
  try {
    const d = new Date(ts);
    // Show local time in 24h; include seconds (set second:false if you prefer)
    return d.toLocaleTimeString(undefined, { hour12: false });
    // Or, for HH:mm only:
    // return d.toLocaleTimeString(undefined, { hour12: false, hour: '2-digit', minute: '2-digit' });
  } catch {
    // Fallback: if ts is already a time string or malformed, show as-is
    return ts || '';
  }
}

function safe(s) {
  return (s ?? '').toString().replace(/[<>&]/g, ch => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[ch]));
}
// -----------------------------------