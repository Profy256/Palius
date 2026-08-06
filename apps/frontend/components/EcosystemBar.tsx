'use client';

import React from 'react';
import { EcosystemProduct } from '@/lib/types';
import { 
  Share2, 
  Palette, 
  BarChart3, 
  Zap, 
  Users, 
  ShoppingBag, 
  BrainCircuit 
} from 'lucide-react';

interface EcosystemBarProps {
  currentProduct: EcosystemProduct;
  onSelectProduct: (product: EcosystemProduct) => void;
}

export function EcosystemBar({ currentProduct, onSelectProduct }: EcosystemBarProps) {
  const products: { id: EcosystemProduct; name: string; icon: React.ReactNode }[] = [
    { id: 'social-os', name: 'Social Media OS', icon: <Share2 className="w-3.5 h-3.5" /> },
    { id: 'studio', name: 'Palius Studio', icon: <Palette className="w-3.5 h-3.5" /> },
    { id: 'analytics', name: 'Palius Analytics', icon: <BarChart3 className="w-3.5 h-3.5" /> },
    { id: 'automations', name: 'Palius Automations', icon: <Zap className="w-3.5 h-3.5" /> },
    { id: 'crm', name: 'Palius CRM', icon: <Users className="w-3.5 h-3.5" /> },
    { id: 'commerce', name: 'Palius Commerce', icon: <ShoppingBag className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="bg-surface border-b border-line px-4 py-2 flex items-center justify-between overflow-x-auto scrollbar-none text-xs">
      <div className="flex items-center space-x-1 min-w-max">
        <div className="flex items-center gap-1.5 px-2.5 py-1 text-brand-400 font-bold text-xs border-r border-line mr-2 tracking-wide">
          <BrainCircuit className="w-4 h-4 text-brand-400" />
          <span>Palius ECOSYSTEM</span>
        </div>
        {products.map(p => {
          const isActive = currentProduct === p.id;
          return (
            <button
              key={p.id}
              onClick={() => onSelectProduct(p.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all text-xs font-semibold ${
                isActive
                  ? 'bg-brand-500 text-ink shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-surface'
              }`}
            >
              {p.icon}
              <span>{p.name}</span>
            </button>
          );
        })}
      </div>
      <div className="hidden md:flex items-center gap-2 text-[11px] text-zinc-400 pl-4">
        <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
        <span className="font-mono text-zinc-300">Unified AI Brain Active</span>
      </div>
    </div>
  );
}
