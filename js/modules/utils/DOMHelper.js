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
        // 統合キーは表示されなくなったため、この処理は実際には使用されない
        if (key === CONFIG.integrationKey) {
            return '共通';
        }
        
        // キーから台帳名を抽出（例：'PC台帳_PC番号' → 'PC台帳'）
        const parts = key.split('_');
        if (parts.length >= 2) {
            return parts[0];
        }
        
        return '不明';
    }
}

// グローバルに公開
window.DOMHelper = DOMHelper; 