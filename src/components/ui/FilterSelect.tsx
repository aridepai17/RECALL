import { ChevronDown, Filter } from 'lucide-react';
import React from 'react';

export interface FilterSelectOption {
    value: string;
    label: string;
}

interface FilterSelectProps {
    value: string;
    onChange: (value: string) => void;
    options: readonly FilterSelectOption[];
    ariaLabel?: string;
    showFilterIcon?: boolean;
    className?: string;
}

export function FilterSelect({
    value,
    onChange,
    options,
    ariaLabel = 'Select option',
    showFilterIcon = false,
    className = '',
}: FilterSelectProps) {
    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        onChange(e.target.value);
    };

    return (
        <div className={`relative inline-flex items-center ${className}`}>
            {showFilterIcon && (
                <Filter className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
            )}
            <select
                value={value}
                onChange={handleChange}
                aria-label={ariaLabel}
                className={`h-10 w-full appearance-none rounded-md bg-white pr-8 font-geist-sans text-[13px] font-black text-black ring-1 ring-black/10 transition-colors duration-150 hover:bg-neutral-50 focus:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus:outline-none ${
                    showFilterIcon ? 'pl-8' : 'pl-3'
                }`}
            >
                {options.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                        {opt.label}
                    </option>
                ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-500" />
        </div>
    );
}

interface SimpleSelectProps {
    value: string;
    onChange: (value: string) => void;
    options: readonly string[] | string[];
    ariaLabel?: string;
    className?: string;
}

export function SimpleSelect({
    value,
    onChange,
    options,
    ariaLabel = 'Select option',
    className = '',
}: SimpleSelectProps) {
    const formattedOptions = options.map((opt) => ({
        value: opt,
        label: opt,
    }));

    return (
        <FilterSelect
            value={value}
            onChange={onChange}
            options={formattedOptions}
            ariaLabel={ariaLabel}
            showFilterIcon={false}
            className={className}
        />
    );
}
