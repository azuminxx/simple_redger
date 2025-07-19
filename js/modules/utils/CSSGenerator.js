/**
 * 動的CSS生成クラス
 */
class CSSGenerator {
    /**
     * 動的CSSを生成してテーブル幅を設定（シンプル版）
     */
    static generateTableWidthCSS() {
        // 既存の動的CSSを削除
        DOMHelper.removeExistingStyle('dynamic-table-width');

        // 新しいCSSを生成
        let css = '';
        let totalWidth = 0;
        
        CONFIG.integratedTableConfig.columns.forEach((column, index) => {
            const width = column.width || CONFIG.system.defaultColumnWidth;
            css += `.integrated-table .col-${index} { 
                width: ${width} !important; 
                min-width: ${width} !important; 
                max-width: ${width} !important; 
            }\n`;
            css += `.integrated-table th:nth-child(${index + 1}) { 
                width: ${width} !important; 
                min-width: ${width} !important; 
                max-width: ${width} !important; 
            }\n`;
            css += `.integrated-table td:nth-child(${index + 1}) { 
                width: ${width} !important; 
                min-width: ${width} !important; 
                max-width: ${width} !important; 
            }\n`;
            totalWidth += DOMHelper.parseWidth(width);
        });
        
        // 境界線の幅を考慮（列数 + 1）
        const borderWidth = (CONFIG.integratedTableConfig.columns.length + 1) * 1;
        const totalTableWidth = totalWidth + borderWidth;
        
        css += `.integrated-table { 
            width: ${totalTableWidth}px !important; 
            table-layout: fixed !important; 
            border-collapse: separate !important;
            border-spacing: 0 !important;
        }\n`;

        // スタイル要素を作成して追加
        DOMHelper.createStyleElement('dynamic-table-width', css);
    }
}

// グローバルに公開
window.CSSGenerator = CSSGenerator; 