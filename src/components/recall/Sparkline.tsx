import { useMemo } from 'react';

interface SparklineProps {
    grades: number[];
    maxItems?: number;
    className?: string;
}

function getGradeColor(grade: number): string {
    switch (grade) {
        case 0:
            return 'bg-lapsed';
        case 1:
            return 'bg-neutral-500';
        case 2:
            return 'bg-healthy/60';
        case 3:
            return 'bg-healthy';
        default:
            return 'bg-neutral-700';
    }
}

function getGradeHeight(grade: number): string {
    switch (grade) {
        case 0:
            return 'h-1.5';
        case 1:
            return 'h-2.5';
        case 2:
            return 'h-3.5';
        case 3:
            return 'h-5';
        default:
            return 'h-1';
    }
}

export function Sparkline({ grades = [], maxItems = 10, className = '' }: SparklineProps) {
    const visibleGrades = useMemo(() => {
        if (!grades || grades.length === 0) return [];
        return grades.slice(-maxItems);
    }, [grades, maxItems]);

    if (visibleGrades.length === 0) {
        return (
            <div className={`flex items-center gap-1 ${className}`}>
                {Array.from({ length: 4 }).map((_, i) => (
                    <span
                        key={i}
                        className="h-1 w-1.5 rounded-xs bg-neutral-800"
                        title="No history"
                    />
                ))}
            </div>
        );
    }

    return (
        <div className={`flex items-end gap-1 h-5 ${className}`}>
            {visibleGrades.map((grade, idx) => (
                <span
                    key={idx}
                    className={`w-1.5 rounded-xs transition-all duration-150 ${getGradeHeight(
                        grade,
                    )} ${getGradeColor(grade)}`}
                    title={`Attempt ${idx + 1}: Grade ${grade}`}
                />
            ))}
        </div>
    );
}
