#!/usr/bin/env python3
"""
TLB and Page Table Simulator (Python CLI Implementation)
OSSP Hackathon 2026 - Virtual Memory Translation Engine

Features:
- Configurable Page Size, TLB Capacity, and RAM Frames
- LRU and FIFO Replacement Policies
- Demand Paging & Page Fault Emulation
- Effective Access Time (EAT) Metrics
- Interactive REPL or Batch Workload Mode
"""

import sys
import math
import argparse
from typing import List, Dict, Optional, Tuple

class VirtualMemorySimulator:
    def __init__(self, page_size: int = 4096, tlb_size: int = 4, policy: str = 'LRU', 
                 frames_count: int = 8, tlb_time: float = 2.0, mem_time: float = 100.0,
                 fault_penalty: float = 8000.0):
        self.page_size = page_size
        self.tlb_size = tlb_size
        self.policy = policy.upper()
        self.frames_count = frames_count
        self.tlb_time = tlb_time
        self.mem_time = mem_time
        self.fault_penalty = fault_penalty

        self.offset_bits = int(math.log2(self.page_size))
        self.offset_mask = (1 << self.offset_bits) - 1
        self.num_pages = 65536 // self.page_size  # 16-bit address space

        # Hardware structures
        self.tlb: List[Dict] = [{'vpn': None, 'pfn': None, 'valid': False, 'age': 0, 'fifo': 0} for _ in range(self.tlb_size)]
        self.page_table: List[Dict] = [{'vpn': i, 'pfn': None, 'valid': False, 'ref': False, 'dirty': False} for i in range(self.num_pages)]
        self.frames: List[Dict] = [{'pfn': i, 'allocated': False, 'vpn': None, 'last_used': 0} for i in range(self.frames_count)]

        # Counters & Statistics
        self.access_counter = 0
        self.fifo_counter = 0
        self.tlb_hits = 0
        self.tlb_misses = 0
        self.page_hits = 0
        self.page_faults = 0

        self._preload_defaults()

    def _preload_defaults(self):
        # Preload page 0 -> frame 0, page 1 -> frame 2
        initial = [(0, 0), (1, 2)]
        for vpn, pfn in initial:
            if vpn < self.num_pages and pfn < self.frames_count:
                self.page_table[vpn]['valid'] = True
                self.page_table[vpn]['pfn'] = pfn
                self.frames[pfn]['allocated'] = True
                self.frames[pfn]['vpn'] = vpn

        # TLB preload
        self.tlb[0] = {'vpn': 1, 'pfn': 2, 'valid': True, 'age': 1, 'fifo': 1}
        self.fifo_counter = 1
        self.access_counter = 1

    def decompose(self, va: int) -> Tuple[int, int]:
        vpn = va >> self.offset_bits
        offset = va & self.offset_mask
        return vpn, offset

    def translate(self, va: int) -> Dict:
        self.access_counter += 1
        vpn, offset = self.decompose(va)

        tlb_hit = False
        tlb_slot = -1
        pfn = None
        page_fault = False

        # 1. TLB Lookup
        for i, entry in enumerate(self.tlb):
            if entry['valid'] and entry['vpn'] == vpn:
                tlb_hit = True
                tlb_slot = i
                pfn = entry['pfn']
                entry['age'] = self.access_counter
                break

        if tlb_hit:
            self.tlb_hits += 1
            self.page_hits += 1
        else:
            self.tlb_misses += 1
            # 2. Page Table Lookup
            if vpn < len(self.page_table) and self.page_table[vpn]['valid']:
                pfn = self.page_table[vpn]['pfn']
                self.page_hits += 1
                self.page_table[vpn]['ref'] = True
            else:
                # 3. Page Fault
                page_fault = True
                self.page_faults += 1
                pfn = self._handle_page_fault(vpn)

            # 4. Insert into TLB
            self._update_tlb(vpn, pfn)

        # 5. Update Frame
        if pfn is not None and pfn < len(self.frames):
            self.frames[pfn]['last_used'] = self.access_counter

        # 6. Physical address
        pa = (pfn << self.offset_bits) | offset

        return {
            'va': va,
            'vpn': vpn,
            'offset': offset,
            'pfn': pfn,
            'pa': pa,
            'tlb_hit': tlb_hit,
            'tlb_slot': tlb_slot,
            'page_fault': page_fault
        }

    def _handle_page_fault(self, vpn: int) -> int:
        free_frame = next((f['pfn'] for f in self.frames if not f['allocated']), None)
        if free_frame is None:
            # Frame Eviction (LRU)
            victim = min(self.frames, key=lambda f: f['last_used'])
            old_vpn = victim['vpn']
            if old_vpn is not None:
                self.page_table[old_vpn]['valid'] = False
                self.page_table[old_vpn]['pfn'] = None
                # Invalidate in TLB
                for slot in self.tlb:
                    if slot['valid'] and slot['vpn'] == old_vpn:
                        slot['valid'] = False
            free_frame = victim['pfn']

        self.frames[free_frame]['allocated'] = True
        self.frames[free_frame]['vpn'] = vpn
        self.frames[free_frame]['last_used'] = self.access_counter

        self.page_table[vpn]['valid'] = True
        self.page_table[vpn]['pfn'] = free_frame
        self.page_table[vpn]['ref'] = True
        return free_frame

    def _update_tlb(self, vpn: int, pfn: int):
        # Empty slot?
        empty = next((i for i, s in enumerate(self.tlb) if not s['valid']), None)
        if empty is not None:
            self.fifo_counter += 1
            self.tlb[empty] = {
                'vpn': vpn, 'pfn': pfn, 'valid': True, 
                'age': self.access_counter, 'fifo': self.fifo_counter
            }
            return

        # Eviction
        if self.policy == 'FIFO':
            victim_idx = min(range(self.tlb_size), key=lambda i: self.tlb[i]['fifo'])
        else:  # LRU
            victim_idx = min(range(self.tlb_size), key=lambda i: self.tlb[i]['age'])

        self.fifo_counter += 1
        self.tlb[victim_idx] = {
            'vpn': vpn, 'pfn': pfn, 'valid': True, 
            'age': self.access_counter, 'fifo': self.fifo_counter
        }

    def get_eat(self) -> Tuple[float, float, float]:
        total = self.tlb_hits + self.tlb_misses
        if total == 0:
            return 0.0, 0.0, 0.0
        hit_ratio = self.tlb_hits / total
        miss_ratio = 1.0 - hit_ratio
        fault_ratio = self.page_faults / total

        eat_base = (hit_ratio * (self.tlb_time + self.mem_time)) + \
                   (miss_ratio * (self.tlb_time + 2 * self.mem_time))
        eat_total = eat_base + (fault_ratio * self.fault_penalty)
        return hit_ratio * 100.0, eat_base, eat_total

    def print_state(self):
        print("\n" + "=" * 60)
        print(" [TLB STATE] Policy: {}".format(self.policy))
        print(" Slot | Valid | VPN (Tag) | PFN (Frame) | LRU Age | FIFO Order")
        print(" " + "-" * 56)
        for i, s in enumerate(self.tlb):
            v_str = "1 (V)" if s['valid'] else "0 (I)"
            vpn_str = f"0x{s['vpn']:X} ({s['vpn']})" if s['valid'] else "--"
            pfn_str = f"Frame {s['pfn']}" if s['valid'] else "--"
            print(f"  #{i:<3} | {v_str:<5} | {vpn_str:<9} | {pfn_str:<11} | {s['age']:<7} | {s['fifo']}")

        print("\n [PAGE TABLE (Resident Pages)]")
        print(" VPN | Status   | PFN (Frame) | Ref | Dirty")
        print(" " + "-" * 42)
        for pt in self.page_table:
            if pt['valid']:
                print(f"  {pt['vpn']:<3} | RESIDENT | Frame {pt['pfn']:<5} |  1  |  0")

        hr, eat_base, eat_full = self.get_eat()
        print("\n [METRICS]")
        print(f" Total Accesses: {self.access_counter - 1} | TLB Hits: {self.tlb_hits} | TLB Misses: {self.tlb_misses}")
        print(f" Page Faults:    {self.page_faults}")
        print(f" TLB Hit Ratio:  {hr:.1f}%")
        print(f" Base EAT:       {eat_base:.2f} ns (Hit: {self.tlb_time + self.mem_time}ns, Miss: {self.tlb_time + 2*self.mem_time}ns)")
        print("=" * 60 + "\n")


def run_interactive(sim: VirtualMemorySimulator):
    print("=" * 60)
    print(" TLB and Page Table Simulator (CLI Interactive Mode)")
    print(" Page Size: {}B | TLB Slots: {} | Policy: {}".format(sim.page_size, sim.tlb_size, sim.policy))
    print(" Type a hex address (e.g., 0x1A4C) or decimal (e.g., 6732).")
    print(" Type 'state' to view memory tables, 'sample' for trace, 'exit' to quit.")
    print("=" * 60)

    while True:
        try:
            line = input("sim> ").strip()
            if not line:
                continue
            if line.lower() in ('exit', 'quit', 'q'):
                print("Exiting simulator. Good luck with the Hackathon!")
                break
            if line.lower() == 'state':
                sim.print_state()
                continue
            if line.lower() == 'sample':
                trace = [0x1004, 0x1020, 0x2050, 0x1080, 0x3010, 0x1090]
                print(f"Running sample trace: {[hex(x) for x in trace]}")
                for addr in trace:
                    res = sim.translate(addr)
                    hit_str = "TLB HIT" if res['tlb_hit'] else ("PAGE FAULT" if res['page_fault'] else "PAGE HIT")
                    print(f"VA: 0x{res['va']:04X} -> VPN: {res['vpn']}, Offset: 0x{res['offset']:03X} -> PFN: {res['pfn']} -> PA: 0x{res['pa']:04X} [{hit_str}]")
                sim.print_state()
                continue

            va = int(line, 16) if line.startswith(('0x', '0X')) else int(line)
            res = sim.translate(va)

            print(f"\n[TRANSLATION RESULT]")
            print(f" Virtual Address:  0x{res['va']:04X} ({res['va']})")
            print(f" Virtual Page (VPN): {res['vpn']} (0x{res['vpn']:X})")
            print(f" Page Offset (d):    0x{res['offset']:03X} ({res['offset']})")
            print(f" TLB Status:         {'HIT (Slot #' + str(res['tlb_slot']) + ')' if res['tlb_hit'] else 'MISS'}")
            print(f" Page Fault Status:  {'PAGE FAULT (Frame allocated)' if res['page_fault'] else 'NO FAULT'}")
            print(f" Frame Number (PFN): Frame #{res['pfn']}")
            print(f" Physical Address:   0x{res['pa']:04X} ({res['pa']})")
            hr, eat_base, _ = sim.get_eat()
            print(f" Current TLB Hit %:  {hr:.1f}% | Current Base EAT: {eat_base:.2f} ns\n")

        except ValueError:
            print("Invalid input! Enter address like 0x1A4C or integer.")
        except (KeyboardInterrupt, EOFError):
            print("\nExiting.")
            break

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="TLB and Page Table Memory Simulator")
    parser.add_argument('--pagesize', type=int, default=4096, help="Page size in bytes (e.g. 256, 1024, 4096)")
    parser.add_argument('--tlb', type=int, default=4, help="Number of TLB cache slots")
    parser.add_argument('--policy', type=str, default='LRU', choices=['LRU', 'FIFO'], help="Replacement policy")
    parser.add_argument('--frames', type=int, default=8, help="Number of physical frames in RAM")
    args = parser.parse_args()

    simulator = VirtualMemorySimulator(
        page_size=args.pagesize,
        tlb_size=args.tlb,
        policy=args.policy,
        frames_count=args.frames
    )
    run_interactive(simulator)
