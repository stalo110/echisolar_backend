"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateInstallments = calculateInstallments;
function calculateInstallments(total, months) {
    const upfront = Number((total / months).toFixed(2));
    const restCount = months - 1;
    const remainder = Number((total - upfront).toFixed(2));
    const per = restCount > 0 ? Number((remainder / restCount).toFixed(2)) : 0;
    const schedule = [];
    const today = new Date();
    for (let i = 0; i < months; i++) {
        const dueDate = new Date(today);
        dueDate.setMonth(dueDate.getMonth() + i);
        schedule.push({
            installmentNumber: i + 1,
            dueDate: dueDate.toISOString().slice(0, 19).replace('T', ' '),
            amount: i === 0 ? upfront : per
        });
    }
    const sum = schedule.reduce((s, it) => s + it.amount, 0);
    const diff = Number((total - sum).toFixed(2));
    if (diff !== 0)
        schedule[schedule.length - 1].amount = Number((schedule[schedule.length - 1].amount + diff).toFixed(2));
    return schedule;
}
//# sourceMappingURL=installmentService.js.map