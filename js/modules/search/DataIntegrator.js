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

        console.log(`🔗 統合キー抽出: ${integrationKeys.length}件`);

        // 全台帳のデータを格納するオブジェクト
        const allLedgerData = {};
        allLedgerData[originalAppId] = originalRecords;

        // 他の台帳を検索するPromiseを作成（ユーザーリストは除外）
        const searchPromises = [];
        
        Object.keys(CONFIG.apps).forEach(appId => {
            if (appId !== originalAppId) {
                const promise = this.searchByIntegrationKeys(appId, integrationKeys)
                    .then(records => {
                        allLedgerData[appId] = records;
                        console.log(`✓ ${CONFIG.apps[appId].name}: ${records.length}件`);
                        return records;
                    });
                searchPromises.push(promise);
            }
        });

        // ユーザーリストをユーザーIDで検索するPromiseを追加
        const userListPromise = this.searchUserListByUserIds(allLedgerData)
            .then(userListData => {
                console.log(`✓ ユーザーリスト: ${userListData.length}件`);
                return userListData;
            });
        searchPromises.push(userListPromise);

        // 全ての検索が完了したらデータを統合
        return Promise.all(searchPromises)
            .then(async (results) => {
                // 最後の結果がユーザーリストデータ
                const userListData = results.pop();
                return await this.integrateAllLedgerDataWithUserList(allLedgerData, integrationKeys, userListData);
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
     * 全台帳からユーザーIDを抽出してユーザーリストを検索
     */
    searchUserListByUserIds(allLedgerData) {
        const userIds = new Set();
        
        // 全台帳からユーザーIDを抽出
        Object.values(allLedgerData).forEach(records => {
            records.forEach(record => {
                const userIdField = record['ユーザーID'];
                if (userIdField && userIdField.value) {
                    userIds.add(userIdField.value);
                }
            });
        });

        if (userIds.size === 0) {
            console.log('ユーザーIDが見つかりませんでした。');
            return Promise.resolve([]);
        }

        // ユーザーIDでユーザーリストを検索
        const userIdList = Array.from(userIds).map(id => `"${id}"`).join(',');
        const query = `ユーザーID in (${userIdList})`;
        
        return window.searchEngine.searchRecordsWithQuery(CONFIG.userList.appId, query);
    }

    /**
     * 全台帳のデータを統合キーで統合し、ユーザーリストからユーザー名を取得
     */
    async integrateAllLedgerDataWithUserList(allLedgerData, integrationKeys, userListData) {
        const integratedData = [];

        // ユーザーリストをユーザーIDでマップ化
        const userMap = new Map();
        userListData.forEach(user => {
            const userId = user['ユーザーID'] && user['ユーザーID'].value;
            const userName = user['ユーザー名'] && user['ユーザー名'].value;
            if (userId) {
                userMap.set(userId, userName || '');
            }
        });

        for (const integrationKey of integrationKeys) {
            const integratedRecord = {};

            // 各台帳からこの統合キーに対応するレコードを取得
            let recordUserId = null;
            
            for (const [appId, records] of Object.entries(allLedgerData)) {
                const matchingRecord = records.find(record => {
                    const keyField = record[CONFIG.integrationKey];
                    return keyField && keyField.value === integrationKey;
                });

                const appConfig = CONFIG.apps[appId];
                const ledgerName = appConfig.name;
                const displayFields = appConfig.displayFields || [];
                
                if (matchingRecord) {
                    // レコードが存在する場合、displayFieldsで指定されたフィールドのみを追加
                    displayFields.forEach(fieldCode => {
                        if (fieldCode !== CONFIG.integrationKey) {
                            const fieldValue = matchingRecord[fieldCode];
                            const displayValue = fieldValue && fieldValue.value !== undefined 
                                ? fieldValue.value 
                                : fieldValue;
                            
                            integratedRecord[`${ledgerName}_${fieldCode}`] = displayValue;
                            
                            // ユーザーIDを記録
                            if (fieldCode === 'ユーザーID' && displayValue) {
                                recordUserId = displayValue;
                            }
                        }
                    });
                } else {
                    // レコードが存在しない場合、displayFieldsのフィールドをnullで埋める
                    displayFields.forEach(fieldCode => {
                        if (fieldCode !== CONFIG.integrationKey) {
                            integratedRecord[`${ledgerName}_${fieldCode}`] = null;
                        }
                    });
                }
            }

            // ユーザーリストからユーザー名を取得
            if (recordUserId && userMap.has(recordUserId)) {
                integratedRecord['ユーザー名'] = userMap.get(recordUserId);
            } else {
                integratedRecord['ユーザー名'] = null;
            }

            integratedData.push(integratedRecord);
        }

        return integratedData;
    }
}

// グローバルに公開
window.DataIntegrator = DataIntegrator; 