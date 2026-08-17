export function wrapWords(text, width) {
    const w = Math.max(1, width);
    const out = [];
    function pushLong(word) {
        if (word.length <= w) {
            out.push(word);
            return;
        }
        for (let i = 0; i < word.length; i += w) {
            out.push(word.slice(i, i + w));
        }
    }
    for (const para of text.split("\n")) {
        if (para.length === 0) {
            out.push("");
            continue;
        }
        const words = para.split(" ");
        let cur = "";
        for (let i = 0; i < words.length; i++) {
            const word = words[i] ?? "";
            if (i === 0) {
                if (word.length > w) {
                    pushLong(word);
                    cur = "";
                }
                else {
                    cur = word;
                }
                continue;
            }
            if (cur.length === 0) {
                if (word.length > w) {
                    pushLong(word);
                }
                else {
                    cur = word;
                }
                continue;
            }
            if (cur.length + 1 + word.length <= w) {
                cur = `${cur} ${word}`;
            }
            else {
                out.push(cur);
                if (word.length > w) {
                    pushLong(word);
                    cur = "";
                }
                else {
                    cur = word;
                }
            }
        }
        out.push(cur);
    }
    return out.length > 0 ? out : [""];
}
//# sourceMappingURL=wrap.js.map