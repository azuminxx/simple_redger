/**
 * kintone API実行回数監視クラス
 */
class APICounter {
    constructor() {
        this.counts = new Map(); // アプリIDごとのAPI実行回数
        this.maxCounts = 10000; // API実行上限
    }

    /**
     * API実行回数をカウント
     */
    count(appId, apiType = 'unknown') {
        if (!this.counts.has(appId)) {
            this.counts.set(appId, 0);
        }
        
        const currentCount = this.counts.get(appId) + 1;
        this.counts.set(appId, currentCount);
        
        const appName = CONFIG.apps[appId] ? CONFIG.apps[appId].name : `App ${appId}`;
        
        console.log(`🔢 API実行回数: ${appName} ${currentCount} - ${apiType}`);
        
        return currentCount;
    }

    /**
     * 指定アプリのAPI実行回数を取得
     */
    getCount(appId) {
        return this.counts.get(appId) || 0;
    }

    /**
     * 全アプリのAPI実行回数を取得
     */
    getAllCounts() {
        const result = {};
        this.counts.forEach((count, appId) => {
            const appName = CONFIG.apps[appId] ? CONFIG.apps[appId].name : `App ${appId}`;
            result[appName] = {
                appId: appId,
                count: count,
                limit: this.maxCounts,
                percentage: ((count / this.maxCounts) * 100).toFixed(1)
            };
        });
        return result;
    }

    /**
     * API実行回数サマリーを表示
     */
    showSummary() {
        console.log('📊 API実行回数サマリー:');
        const allCounts = this.getAllCounts();
        
        if (Object.keys(allCounts).length === 0) {
            console.log('   API実行履歴がありません');
            return;
        }
        
        Object.entries(allCounts).forEach(([appName, info]) => {
            const status = info.percentage >= 90 ? '🔴' : 
                          info.percentage >= 80 ? '🟡' : '🟢';
            console.log(`   ${status} ${appName}: ${info.count}/${info.limit} (${info.percentage}%)`);
        });
    }

    /**
     * API実行回数をリセット
     */
    reset(appId = null) {
        if (appId) {
            this.counts.set(appId, 0);
            const appName = CONFIG.apps[appId] ? CONFIG.apps[appId].name : `App ${appId}`;
            console.log(`🔄 ${appName} のAPI実行回数をリセットしました`);
        } else {
            this.counts.clear();
            console.log('🔄 全アプリのAPI実行回数をリセットしました');
        }
    }
}

// グローバルに公開
window.APICounter = APICounter; 