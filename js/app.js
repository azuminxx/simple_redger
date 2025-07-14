(function() {
    'use strict';

    kintone.events.on('app.record.index.show', function(event) {

        if (event.viewName != 'カスタマイズビュー') {
            return;
        }

        // app:6の全データをカーソルAPIで取得
        getAllRecords();
        
        return event;
    });

    // カーソルAPIを使用してapp:6の全データを取得する関数
    function getAllRecords() {
        // 1. カーソルを作成
        createCursor(6)
            .then(function(cursorId) {
                console.log('カーソルが作成されました:', cursorId);
                // 2. カーソルを使用してレコードを取得
                return getAllRecordsFromCursor(cursorId);
            })
            .then(function(allRecords) {
                console.log('app:6の全データ取得完了');
                console.log('取得したレコード数:', allRecords.length);
                console.log('取得したデータ:', allRecords);
            })
            .catch(function(error) {
                console.error('データ取得エラー:', error);
            });
    }

    // カーソルを作成する関数
    function createCursor(appId) {
        const body = {
            app: appId,
            query: '', // 全データを取得するため空のクエリ
            size: 500  // 1回で取得する最大レコード数
        };

        return kintone.api(kintone.api.url('/k/v1/records/cursor.json', true), 'POST', body)
            .then(function(response) {
                return response.id;
            });
    }

    // カーソルを使用して全レコードを取得する関数
    function getAllRecordsFromCursor(cursorId) {
        const allRecords = [];

        function fetchRecords() {
            const body = {
                id: cursorId
            };

            return kintone.api(kintone.api.url('/k/v1/records/cursor.json', true), 'GET', body)
                .then(function(response) {
                    // 取得したレコードを配列に追加
                    allRecords.push(...response.records);
                    
                    console.log('現在までに取得したレコード数:', allRecords.length);
                    
                    // まだ取得するレコードがある場合は再帰的に呼び出し
                    if (response.next) {
                        return fetchRecords();
                    } else {
                        // 全レコードの取得が完了
                        return allRecords;
                    }
                });
        }

        return fetchRecords();
    }

})(); 