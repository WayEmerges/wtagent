export function okResult(text, extra) {
    return { ok: true, text, ...extra };
}
export function errResult(text) {
    return { ok: false, text };
}
//# sourceMappingURL=types.js.map