// TLB & Page Table Architecture Simulator Engine
class VirtualMemorySimulator {
  constructor() {
    this.config = {
      pageSize: 4096, // 4KB default
      tlbCapacity: 4,
      replacementPolicy: 'LRU', // 'LRU' or 'FIFO'
      ramFrames: 8,
      tlbTimeNs: 2,
      memTimeNs: 100,
      faultPenaltyNs: 8000
    };

    this.stats = {
      tlbHits: 0,
      tlbMisses: 0,
      pageHits: 0,
      pageFaults: 0,
      totalAccesses: 0
    };

    this.accessCounter = 0;
    this.fifoCounter = 0;
    this.tlb = []; // Array of { vpn, pfn, valid, dirty, age, fifoOrder }
    this.pageTable = []; // Array indexed by VPN: { pfn, valid, referenced, dirty }
    this.frames = []; // Array indexed by PFN: { allocated: bool, vpn: number, lastUsed: number }

    this.initHardware();
  }

  initHardware() {
    // Offset bits calculation
    this.offsetBits = Math.log2(this.config.pageSize);
    this.offsetMask = (1 << this.offsetBits) - 1;

    // Total virtual pages (assuming 16-bit address space for simplicity = 65536 bytes / pageSize)
    this.numPages = Math.floor(65536 / this.config.pageSize);

    // Initialize TLB
    this.tlb = [];
    for (let i = 0; i < this.config.tlbCapacity; i++) {
      this.tlb.push({
        slot: i,
        vpn: null,
        pfn: null,
        valid: false,
        dirty: false,
        age: 0,
        fifoOrder: 0
      });
    }

    // Initialize Page Table
    this.pageTable = [];
    for (let vpn = 0; vpn < this.numPages; vpn++) {
      this.pageTable.push({
        vpn: vpn,
        pfn: null,
        valid: false,
        referenced: false,
        dirty: false
      });
    }

    // Initialize Physical Memory (RAM) Frames
    this.frames = [];
    for (let pfn = 0; pfn < this.config.ramFrames; pfn++) {
      this.frames.push({
        pfn: pfn,
        allocated: false,
        vpn: null,
        lastUsed: 0
      });
    }

    // Preload some realistic initial pages (e.g. Page 0 -> Frame 0 (OS/code), Page 1 -> Frame 2)
    this.preloadInitialState();
  }

  preloadInitialState() {
    // Map VPN 0 -> PFN 0, VPN 1 -> PFN 2, VPN 2 -> PFN 1
    const initialMappings = [
      { vpn: 0, pfn: 0 },
      { vpn: 1, pfn: 2 },
      { vpn: 2, pfn: 1 }
    ];

    initialMappings.forEach(m => {
      if (m.vpn < this.numPages && m.pfn < this.config.ramFrames) {
        this.pageTable[m.vpn].valid = true;
        this.pageTable[m.vpn].pfn = m.pfn;
        this.frames[m.pfn].allocated = true;
        this.frames[m.pfn].vpn = m.vpn;
      }
    });

    // Also populate first TLB entry with VPN 1 -> PFN 2
    this.tlb[0] = {
      slot: 0,
      vpn: 1,
      pfn: 2,
      valid: true,
      dirty: false,
      age: 1,
      fifoOrder: 1
    };
    this.fifoCounter = 1;
    this.accessCounter = 1;
  }

  decomposeAddress(virtualAddress) {
    const vpn = virtualAddress >> this.offsetBits;
    const offset = virtualAddress & this.offsetMask;
    return { vpn, offset };
  }

  translate(virtualAddress) {
    this.accessCounter++;
    this.stats.totalAccesses++;

    const { vpn, offset } = this.decomposeAddress(virtualAddress);

    let tlbHit = false;
    let tlbSlot = -1;
    let pageFault = false;
    let evictedTLBSlot = -1;
    let evictedVPN = null;
    let pfn = null;

    // 1. TLB Lookup
    for (let i = 0; i < this.tlb.length; i++) {
      if (this.tlb[i].valid && this.tlb[i].vpn === vpn) {
        tlbHit = true;
        tlbSlot = i;
        pfn = this.tlb[i].pfn;
        this.tlb[i].age = this.accessCounter; // Update LRU
        break;
      }
    }

    if (tlbHit) {
      this.stats.tlbHits++;
      this.stats.pageHits++;
    } else {
      this.stats.tlbMisses++;

      // 2. Page Table Lookup
      if (vpn < this.pageTable.length && this.pageTable[vpn].valid) {
        // Page Table Hit
        pfn = this.pageTable[vpn].pfn;
        this.stats.pageHits++;
        this.pageTable[vpn].referenced = true;
      } else {
        // 3. Page Fault Handling
        pageFault = true;
        this.stats.pageFaults++;
        pfn = this.handlePageFault(vpn);
      }

      // 4. Update TLB with newly resolved mapping
      const updateRes = this.updateTLB(vpn, pfn);
      evictedTLBSlot = updateRes.evictedSlot;
      evictedVPN = updateRes.evictedVPN;
    }

    // 5. Update Physical Frame
    if (pfn !== null && pfn < this.frames.length) {
      this.frames[pfn].lastUsed = this.accessCounter;
    }

    // 6. Compute Physical Address
    const physicalAddress = (pfn << this.offsetBits) | offset;

    return {
      virtualAddress,
      vpn,
      offset,
      pfn,
      physicalAddress,
      tlbHit,
      tlbSlot,
      pageFault,
      evictedTLBSlot,
      evictedVPN
    };
  }

  handlePageFault(vpn) {
    // Find free frame
    let freeFrame = this.frames.findIndex(f => !f.allocated);

    if (freeFrame === -1) {
      // Evict using LRU on frames
      let oldestTime = Infinity;
      let frameToEvict = 0;
      for (let i = 0; i < this.frames.length; i++) {
        if (this.frames[i].lastUsed < oldestTime) {
          oldestTime = this.frames[i].lastUsed;
          frameToEvict = i;
        }
      }

      const oldVPN = this.frames[frameToEvict].vpn;
      if (oldVPN !== null && oldVPN < this.pageTable.length) {
        this.pageTable[oldVPN].valid = false;
        this.pageTable[oldVPN].pfn = null;
      }

      // Flush matching entry in TLB if present
      for (let i = 0; i < this.tlb.length; i++) {
        if (this.tlb[i].valid && this.tlb[i].vpn === oldVPN) {
          this.tlb[i].valid = false;
        }
      }

      freeFrame = frameToEvict;
    }

    // Allocate frame
    this.frames[freeFrame].allocated = true;
    this.frames[freeFrame].vpn = vpn;
    this.frames[freeFrame].lastUsed = this.accessCounter;

    // Update Page Table
    if (vpn < this.pageTable.length) {
      this.pageTable[vpn].valid = true;
      this.pageTable[vpn].pfn = freeFrame;
      this.pageTable[vpn].referenced = true;
    }

    return freeFrame;
  }

  updateTLB(vpn, pfn) {
    // Check if empty slot available
    const emptySlot = this.tlb.findIndex(slot => !slot.valid);
    if (emptySlot !== -1) {
      this.fifoCounter++;
      this.tlb[emptySlot] = {
        slot: emptySlot,
        vpn,
        pfn,
        valid: true,
        dirty: false,
        age: this.accessCounter,
        fifoOrder: this.fifoCounter
      };
      return { slot: emptySlot, evictedSlot: -1, evictedVPN: null };
    }

    // Eviction Needed
    let victimSlot = 0;
    if (this.config.replacementPolicy === 'FIFO') {
      let lowestOrder = Infinity;
      for (let i = 0; i < this.tlb.length; i++) {
        if (this.tlb[i].fifoOrder < lowestOrder) {
          lowestOrder = this.tlb[i].fifoOrder;
          victimSlot = i;
        }
      }
    } else {
      // LRU
      let oldestAge = Infinity;
      for (let i = 0; i < this.tlb.length; i++) {
        if (this.tlb[i].age < oldestAge) {
          oldestAge = this.tlb[i].age;
          victimSlot = i;
        }
      }
    }

    const evictedVPN = this.tlb[victimSlot].vpn;
    this.fifoCounter++;
    this.tlb[victimSlot] = {
      slot: victimSlot,
      vpn,
      pfn,
      valid: true,
      dirty: false,
      age: this.accessCounter,
      fifoOrder: this.fifoCounter
    };

    return { slot: victimSlot, evictedSlot: victimSlot, evictedVPN };
  }

  getEAT() {
    if (this.stats.totalAccesses === 0) return 0;
    const hitRate = this.stats.tlbHits / this.stats.totalAccesses;
    const missRate = 1 - hitRate;
    const faultRate = this.stats.pageFaults / this.stats.totalAccesses;

    // Standard EAT formula:
    // EAT = H * (t_tlb + t_mem) + (1 - H) * (t_tlb + 2*t_mem) + FaultRate * t_fault
    const hitTime = this.config.tlbTimeNs + this.config.memTimeNs;
    const missTime = this.config.tlbTimeNs + (2 * this.config.memTimeNs);
    const baseEAT = (hitRate * hitTime) + (missRate * missTime);
    const eatWithFault = baseEAT + (faultRate * this.config.faultPenaltyNs);

    return {
      baseEAT: baseEAT.toFixed(2),
      totalEAT: eatWithFault.toFixed(2),
      hitRate: (hitRate * 100).toFixed(1),
      faultRate: (faultRate * 100).toFixed(1)
    };
  }

  reset() {
    this.stats = {
      tlbHits: 0,
      tlbMisses: 0,
      pageHits: 0,
      pageFaults: 0,
      totalAccesses: 0
    };
    this.accessCounter = 0;
    this.fifoCounter = 0;
    this.initHardware();
  }
}

// UI Controller
document.addEventListener('DOMContentLoaded', () => {
  const sim = new VirtualMemorySimulator();

  // Elements
  const inputVA = document.getElementById('input-virtual-address');
  const btnTranslate = document.getElementById('btn-translate');
  const btnRandom = document.getElementById('btn-random-addr');
  const btnReset = document.getElementById('btn-reset');
  const btnStepWalk = document.getElementById('btn-step-walk');
  const btnRunWorkload = document.getElementById('btn-run-workload');
  const btnClearLog = document.getElementById('btn-clear-log');

  const breakdownVPN = document.getElementById('breakdown-vpn');
  const breakdownVPNDetails = document.getElementById('breakdown-vpn-bits');
  const breakdownOffset = document.getElementById('breakdown-offset');
  const breakdownOffsetBits = document.getElementById('breakdown-offset-bits');

  const stageResultText = document.getElementById('stage-result-text');
  const stepBadge = document.getElementById('step-badge');
  const badgeStatus = document.getElementById('badge-status');

  const kpiHitRate = document.getElementById('kpi-tlb-hit-rate');
  const kpiTlbCounts = document.getElementById('kpi-tlb-counts');
  const barTlbHit = document.getElementById('bar-tlb-hit');

  const kpiFaultRate = document.getElementById('kpi-page-fault-rate');
  const kpiFaultCounts = document.getElementById('kpi-fault-counts');
  const barFaultRate = document.getElementById('bar-fault-rate');

  const kpiEAT = document.getElementById('kpi-eat');
  const kpiRamUsage = document.getElementById('kpi-ram-usage');
  const barRamUsage = document.getElementById('bar-ram-usage');
  const kpiPolicyBadge = document.getElementById('kpi-policy-badge');
  const tlbPolicyTag = document.getElementById('tlb-policy-tag');

  const tlbBody = document.getElementById('tlb-body');
  const ptBody = document.getElementById('pt-body');
  const ramFramesGrid = document.getElementById('ram-frames-grid');
  const systemLog = document.getElementById('system-log');

  // Modal elements
  const btnConfigToggle = document.getElementById('btn-config-toggle');
  const configModal = document.getElementById('config-modal');
  const modalClose = document.getElementById('modal-close');
  const modalCancel = document.getElementById('modal-cancel');
  const modalSave = document.getElementById('modal-save');
  const cfgPageSize = document.getElementById('cfg-page-size');
  const cfgTlbSize = document.getElementById('cfg-tlb-size');
  const cfgPolicy = document.getElementById('cfg-replacement-policy');
  const cfgFrames = document.getElementById('cfg-ram-frames');
  const cfgTlbTime = document.getElementById('cfg-tlb-time');
  const cfgMemTime = document.getElementById('cfg-mem-time');
  const cfgFaultPenalty = document.getElementById('cfg-fault-penalty');

  let activeWorkload = 'temporal';

  // Helper: parse hex or decimal address
  function parseAddress(str) {
    if (!str) return 0;
    str = str.trim();
    if (str.startsWith('0x') || str.startsWith('0X')) {
      return parseInt(str, 16);
    }
    return parseInt(str, 10);
  }

  // Update UI Tables and Dashboards
  function renderTables(highlightTLBSlot = -1, highlightPTIndex = -1, highlightFrame = -1) {
    // 1. TLB Table
    tlbBody.innerHTML = sim.tlb.map(entry => {
      const isHl = entry.slot === highlightTLBSlot;
      return `
        <tr class="${isHl ? 'highlight-hit' : ''}">
          <td>#${entry.slot}</td>
          <td><span class="badge ${entry.valid ? 'badge-hit' : 'badge-miss'}">${entry.valid ? '1 (V)' : '0 (I)'}</span></td>
          <td>${entry.valid ? '0x' + entry.vpn.toString(16).toUpperCase() + ` (${entry.vpn})` : '--'}</td>
          <td>${entry.valid ? 'Frame ' + entry.pfn : '--'}</td>
          <td>${entry.valid ? 'Age: ' + entry.age : '--'}</td>
          <td>${entry.valid ? '<span style="color:#2cb67d">CACHED</span>' : '<span style="color:#62728b">EMPTY</span>'}</td>
        </tr>
      `;
    }).join('');

    // 2. Page Table
    ptBody.innerHTML = sim.pageTable.map(entry => {
      const isHl = entry.vpn === highlightPTIndex;
      return `
        <tr class="${isHl ? 'highlight-miss' : ''}">
          <td><strong>Page ${entry.vpn} (0x${entry.vpn.toString(16).toUpperCase()})</strong></td>
          <td><span class="badge ${entry.valid ? 'badge-hit' : 'badge-miss'}">${entry.valid ? '1 (In RAM)' : '0 (Fault/Disk)'}</span></td>
          <td>${entry.valid ? 'Frame ' + entry.pfn : 'NULL'}</td>
          <td>${entry.referenced ? '1' : '0'}</td>
          <td>${entry.dirty ? '1' : '0'}</td>
          <td>${entry.valid ? '<span style="color:#4facfe">RESIDENT</span>' : '<span style="color:#ff5470">ON DISK</span>'}</td>
        </tr>
      `;
    }).join('');

    // 3. Physical RAM Frames
    ramFramesGrid.innerHTML = sim.frames.map(frame => {
      const isHl = frame.pfn === highlightFrame;
      return `
        <div class="frame-block ${frame.allocated ? 'allocated' : ''} ${isHl ? 'active' : ''}">
          <div class="frame-num">Frame #${frame.pfn}</div>
          <div class="frame-page">${frame.allocated ? 'Page ' + frame.vpn : 'EMPTY'}</div>
          <div class="frame-status">${frame.allocated ? 'Used (t=' + frame.lastUsed + ')' : 'Available'}</div>
        </div>
      `;
    }).join('');

    // 4. Update KPIs
    const eatData = sim.getEAT();
    kpiHitRate.textContent = eatData.hitRate + '%';
    kpiTlbCounts.textContent = `${sim.stats.tlbHits} Hits / ${sim.stats.totalAccesses} Total`;
    barTlbHit.style.width = eatData.hitRate + '%';

    kpiFaultRate.textContent = eatData.faultRate + '%';
    kpiFaultCounts.textContent = `${sim.stats.pageFaults} Faults / ${sim.stats.tlbMisses} Misses`;
    barFaultRate.style.width = eatData.faultRate + '%';

    kpiEAT.textContent = eatData.baseEAT + ' ns';

    const allocatedCount = sim.frames.filter(f => f.allocated).length;
    kpiRamUsage.textContent = `${allocatedCount} / ${sim.config.ramFrames} Frames`;
    barRamUsage.style.width = ((allocatedCount / sim.config.ramFrames) * 100) + '%';
    kpiPolicyBadge.textContent = `Policy: ${sim.config.replacementPolicy} | Page: ${sim.config.pageSize}B`;
    tlbPolicyTag.textContent = `Policy: ${sim.config.replacementPolicy}`;
  }

  function appendLog(message, type = 'info') {
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    const timestamp = new Date().toLocaleTimeString();
    entry.innerHTML = `[${timestamp}] ${message}`;
    systemLog.appendChild(entry);
    systemLog.scrollTop = systemLog.scrollHeight;
  }

  function updateAddressDecomposition(va) {
    const { vpn, offset } = sim.decomposeAddress(va);
    const vpnHex = '0x' + vpn.toString(16).toUpperCase();
    const offsetHex = '0x' + offset.toString(16).toUpperCase();

    breakdownVPN.textContent = `${vpnHex} (Page ${vpn})`;
    const vpnBits = vpn.toString(2).padStart(16 - sim.offsetBits, '0');
    breakdownVPNDetails.textContent = `Bits [${vpnBits}]`;

    breakdownOffset.textContent = `${offsetHex} (${offset})`;
    const offsetBitsStr = offset.toString(2).padStart(sim.offsetBits, '0');
    breakdownOffsetBits.textContent = `Bits [${offsetBitsStr}]`;
  }

  function resetPipelineHighlights() {
    ['pipe-step-1', 'pipe-step-2', 'pipe-step-3', 'pipe-step-4'].forEach(id => {
      const el = document.getElementById(id);
      el.className = 'pipeline-step';
    });
  }

  // Single Translation Execution
  function executeTranslation(addressInput) {
    const va = parseAddress(addressInput);
    if (isNaN(va) || va < 0) {
      alert('Please enter a valid hexadecimal or decimal address (e.g. 0x1A4C).');
      return;
    }

    updateAddressDecomposition(va);
    resetPipelineHighlights();

    const res = sim.translate(va);

    // Stage 1 active
    document.getElementById('pipe-step-1').classList.add('active');

    // Stage 2: TLB
    const pipe2 = document.getElementById('pipe-step-2');
    if (res.tlbHit) {
      pipe2.classList.add('success');
      appendLog(`TLB HIT: VPN ${res.vpn} found in TLB Slot #${res.tlbSlot} ➔ Frame #${res.pfn}`, 'hit');
    } else {
      pipe2.classList.add('active');
      appendLog(`TLB MISS: VPN ${res.vpn} not present in TLB cache. Proceeding to Page Table.`, 'miss');
    }

    // Stage 3: Page Table / Fault
    const pipe3 = document.getElementById('pipe-step-3');
    if (res.pageFault) {
      pipe3.classList.add('fault');
      appendLog(`PAGE FAULT: Page ${res.vpn} not resident in memory! Allocated Frame #${res.pfn} via demand paging.`, 'fault');
    } else if (!res.tlbHit) {
      pipe3.classList.add('success');
      appendLog(`PAGE TABLE HIT: Page ${res.vpn} is resident in Frame #${res.pfn}. Loaded to TLB.`, 'info');
    }

    // Stage 4: Physical Address
    const pipe4 = document.getElementById('pipe-step-4');
    pipe4.classList.add('active');

    // Status message
    let statusSummary = `
      <strong>VA:</strong> 0x${res.virtualAddress.toString(16).toUpperCase()} ➔ 
      <strong>VPN:</strong> ${res.vpn} | <strong>Offset:</strong> 0x${res.offset.toString(16).toUpperCase()} <br>
      <strong>Result:</strong> ${res.tlbHit ? '<span style="color:#2cb67d;font-weight:bold;">TLB HIT</span>' : '<span style="color:#ffaa00;font-weight:bold;">TLB MISS</span>'} 
      ${res.pageFault ? ' + <span style="color:#ff5470;font-weight:bold;">PAGE FAULT</span>' : ''} <br>
      <strong>Physical Address:</strong> <span style="color:#00f2fe;font-weight:bold;">0x${res.physicalAddress.toString(16).toUpperCase()}</span> 
      (Frame ${res.pfn} * ${sim.config.pageSize} + ${res.offset})
    `;
    stageResultText.innerHTML = statusSummary;
    stepBadge.textContent = res.tlbHit ? 'TLB Hit' : (res.pageFault ? 'Page Fault' : 'PT Hit');
    stepBadge.className = `badge ${res.tlbHit ? 'badge-hit' : 'badge-miss'}`;

    renderTables(res.tlbSlot, res.vpn, res.pfn);
  }

  // Event Listeners
  btnTranslate.addEventListener('click', () => {
    executeTranslation(inputVA.value);
  });

  inputVA.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') executeTranslation(inputVA.value);
  });

  inputVA.addEventListener('input', () => {
    const va = parseAddress(inputVA.value);
    if (!isNaN(va) && va >= 0) {
      updateAddressDecomposition(va);
    }
  });

  btnRandom.addEventListener('click', () => {
    const randomVPN = Math.floor(Math.random() * 8);
    const randomOffset = Math.floor(Math.random() * sim.config.pageSize);
    const randomVA = (randomVPN << sim.offsetBits) | randomOffset;
    inputVA.value = '0x' + randomVA.toString(16).toUpperCase();
    executeTranslation(inputVA.value);
  });

  btnReset.addEventListener('click', () => {
    sim.reset();
    inputVA.value = '0x1A4C';
    updateAddressDecomposition(0x1A4C);
    resetPipelineHighlights();
    stageResultText.textContent = 'System reset. Memory structures initialized with standard test pages.';
    stepBadge.textContent = 'Idle';
    stepBadge.className = 'badge';
    appendLog('System reset. Hardware registers and counters restored to initial state.', 'system');
    renderTables();
  });

  btnClearLog.addEventListener('click', () => {
    systemLog.innerHTML = '';
  });

  // Step-by-Step Walk Animation
  btnStepWalk.addEventListener('click', async () => {
    const va = parseAddress(inputVA.value);
    if (isNaN(va)) return;

    btnStepWalk.disabled = true;
    resetPipelineHighlights();

    // Step 1: Breakdown
    document.getElementById('pipe-step-1').classList.add('active');
    stageResultText.innerHTML = `<strong>Step 1:</strong> Decomposing Virtual Address 0x${va.toString(16).toUpperCase()} into VPN and Offset.`;
    updateAddressDecomposition(va);
    await new Promise(r => setTimeout(r, 600));

    // Step 2: TLB
    document.getElementById('pipe-step-2').classList.add('active');
    stageResultText.innerHTML = `<strong>Step 2:</strong> Probing Translation Lookaside Buffer for VPN ${va >> sim.offsetBits}...`;
    await new Promise(r => setTimeout(r, 700));

    executeTranslation(inputVA.value);
    btnStepWalk.disabled = false;
  });

  // Benchmark Workload selector
  document.querySelectorAll('[data-workload]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-workload]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeWorkload = btn.getAttribute('data-workload');
    });
  });

  // Run Batch Workload
  btnRunWorkload.addEventListener('click', async () => {
    let trace = [];
    const ps = sim.config.pageSize;

    if (activeWorkload === 'temporal') {
      // Accessing same 2 pages repeatedly (High TLB hits)
      trace = [0x1004, 0x1008, 0x1020, 0x2040, 0x1050, 0x2080, 0x1090, 0x20A0];
    } else if (activeWorkload === 'spatial') {
      // Sequential accesses crossing pages
      trace = [0x0010, 0x0050, 0x0800, 0x1000, 0x1200, 0x1400, 0x2000, 0x3000];
    } else if (activeWorkload === 'loop') {
      // Loop over 5 pages (exceeding a 4-entry TLB to cause eviction & demonstration)
      trace = [0x0010, 0x1010, 0x2010, 0x3010, 0x4010, 0x0020, 0x1020, 0x2020];
    } else {
      // Random
      for (let i = 0; i < 8; i++) {
        trace.push(Math.floor(Math.random() * 0x6000));
      }
    }

    appendLog(`Starting automated batch benchmark: [${activeWorkload.toUpperCase()}] with ${trace.length} memory references...`, 'system');

    btnRunWorkload.disabled = true;
    for (let i = 0; i < trace.length; i++) {
      const hex = '0x' + trace[i].toString(16).toUpperCase();
      inputVA.value = hex;
      executeTranslation(hex);
      await new Promise(r => setTimeout(r, 350));
    }
    btnRunWorkload.disabled = false;
    appendLog(`Batch benchmark [${activeWorkload.toUpperCase()}] finished. Review updated EAT and Hit Ratios.`, 'system');
  });

  // Modal handlers
  btnConfigToggle.addEventListener('click', () => {
    cfgPageSize.value = sim.config.pageSize;
    cfgTlbSize.value = sim.config.tlbCapacity;
    cfgPolicy.value = sim.config.replacementPolicy;
    cfgFrames.value = sim.config.ramFrames;
    cfgTlbTime.value = sim.config.tlbTimeNs;
    cfgMemTime.value = sim.config.memTimeNs;
    cfgFaultPenalty.value = sim.config.faultPenaltyNs;
    configModal.classList.add('active');
  });

  modalClose.addEventListener('click', () => configModal.classList.remove('active'));
  modalCancel.addEventListener('click', () => configModal.classList.remove('active'));

  modalSave.addEventListener('click', () => {
    sim.config.pageSize = parseInt(cfgPageSize.value, 10);
    sim.config.tlbCapacity = parseInt(cfgTlbSize.value, 10);
    sim.config.replacementPolicy = cfgPolicy.value;
    sim.config.ramFrames = parseInt(cfgFrames.value, 10);
    sim.config.tlbTimeNs = parseFloat(cfgTlbTime.value);
    sim.config.memTimeNs = parseFloat(cfgMemTime.value);
    sim.config.faultPenaltyNs = parseFloat(cfgFaultPenalty.value);

    sim.reset();
    configModal.classList.remove('active');
    appendLog(`Configuration applied: PageSize=${sim.config.pageSize}B, TLB=${sim.config.tlbCapacity}, Policy=${sim.config.replacementPolicy}`, 'system');
    updateAddressDecomposition(parseAddress(inputVA.value));
    renderTables();
  });

  // Initial render
  updateAddressDecomposition(0x1A4C);
  renderTables();
});
