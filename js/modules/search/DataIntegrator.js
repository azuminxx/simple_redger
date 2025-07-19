/**
 * データ統合クラス
 */
class DataIntegrator {
    /**
     * 統合キーを使って全台帳を検索
     */
    searchAllLedgersWithIntegrationKeys(originalAppId, originalRecords) {
        // 統合キーを抽出
        const integrationKeys = this.extractIntegrationKeys(originalRecords);
        
        if (integrationKeys.length === 0) {
            console.log(CONFIG.system.messages.noIntegrationKeys);
            return Promise.resolve([]);
        }

        console.log(`抽出された統合キー（${integrationKeys.length}個）:`, integrationKeys);

        // 全台帳のデータを格納するオブジェクト
        const allLedgerData = {};
        allLedgerData[originalAppId] = originalRecords;

        // 他の台帳を検索するPromiseを作成
        const searchPromises = [];
        
        Object.keys(CONFIG.apps).forEach(appId => {
            if (appId !== originalAppId) {
                const promise = this.searchByIntegrationKeys(appId, integrationKeys)
                    .then(records => {
                        allLedgerData[appId] = records;
                        console.log(`${CONFIG.apps[appId].name}の統合検索結果（${records.length}件）:`, records);
                        return records;
                    });
                searchPromises.push(promise);
            }
        });

        // 全ての検索が完了したらデータを統合
        return Promise.all(searchPromises)
            .then(() => {
                return this.integrateAllLedgerData(allLedgerData, integrationKeys);
            });
    }

    /**
     * レコードから統合キーを抽出
     */
    extractIntegrationKeys(records) {
        const integrationKeys = new Set();
        
        records.forEach(record => {
            const keyField = record[CONFIG.integrationKey];
            if (keyField && keyField.value) {
                integrationKeys.add(keyField.value);
            }
        });

        return Array.from(integrationKeys);
    }

    /**
     * 統合キーを使って特定の台帳を検索
     */
    searchByIntegrationKeys(appId, integrationKeys) {
        // IN演算子で統合キーの配列を検索
        const keyList = integrationKeys.map(key => `"${key}"`).join(',');
        const query = `${CONFIG.integrationKey} in (${keyList})`;
        
        return window.searchEngine.searchRecordsWithQuery(appId, query);
    }

    /**
     * 全台帳のデータを統合キーで統合
     */
    integrateAllLedgerData(allLedgerData, integrationKeys) {
        const integratedData = [];

        integrationKeys.forEach(integrationKey => {
            const integratedRecord = {
                [CONFIG.integrationKey]: integrationKey
            };

            // 各台帳からこの統合キーに対応するレコードを取得
            Object.entries(allLedgerData).forEach(([appId, records]) => {
                const matchingRecord = records.find(record => {
                    const keyField = record[CONFIG.integrationKey];
                    return keyField && keyField.value === integrationKey;
                });

                const ledgerName = CONFIG.apps[appId].name;
                
                if (matchingRecord) {
                    // レコードが存在する場合、全フィールドを追加（統合キーは除く）
                    Object.entries(matchingRecord).forEach(([fieldCode, fieldValue]) => {
                        if (fieldCode !== CONFIG.integrationKey && 
                            fieldCode !== '$id' && 
                            fieldCode !== '$revision') {
                            
                            const displayValue = fieldValue && fieldValue.value !== undefined 
                                ? fieldValue.value 
                                : fieldValue;
                            
                            integratedRecord[`${ledgerName}_${fieldCode}`] = displayValue;
                        }
                    });
                } else {
                    // レコードが存在しない場合、nullで埋める
                    const fields = CONFIG.getAppFields(appId);
                    fields.forEach(field => {
                        if (field.code !== CONFIG.integrationKey) {
                            integratedRecord[`${ledgerName}_${field.code}`] = null;
                        }
                    });
                }
            });

            integratedData.push(integratedRecord);
        });

        return integratedData;
    }
}

// グローバルに公開
window.DataIntegrator = DataIntegrator; 