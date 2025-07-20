/**
 * DOM操作ヘルパークラス
 */
class DOMHelper {
    /**
     * DOM要素を作成するヘルパー関数
     */
    static createElement(tagName, attributes = {}, className = '') {
        const element = document.createElement(tagName);
        
        Object.entries(attributes).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                element.setAttribute(key, value);
            }
        });
        
        if (className) {
            element.className = className;
        }
        
        return element;
    }

    /**
     * 既存のスタイル要素を削除
     */
    static removeExistingStyle(id) {
        const existingStyle = document.getElementById(id);
        if (existingStyle) {
            existingStyle.remove();
        }
    }

    /**
     * スタイル要素を作成
     */
    static createStyleElement(id, css) {
        const style = document.createElement('style');
        style.id = id;
        style.textContent = css;
        document.head.appendChild(style);
    }

    /**
     * 幅の文字列から数値を抽出
     */
    static parseWidth(widthStr) {
        return parseInt(widthStr.replace('px', '')) || 120;
    }

    /**
     * キーから台帳名を取得
     */
    static getLedgerNameFromKey(key) {
        // 変更フラグ列の場合は「共通」を返す
        if (key === 'change-flag') {
            return '共通';
        }
        

        
        // キーから台帳名を抽出（例：'PC台帳_PC番号' → 'PC台帳'）
        const parts = key.split('_');
        if (parts.length >= 2) {
            return parts[0];
        }
        
        return '不明';
    }

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
            // 変更フラグ列は固定幅
            const width = column.isChangeFlag ? '60px' : (column.width || CONFIG.system.defaultColumnWidth);
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
window.DOMHelper = DOMHelper;

// 後方互換性のためCSSGeneratorエイリアスを作成
window.CSSGenerator = {
    generateTableWidthCSS: DOMHelper.generateTableWidthCSS
}; 