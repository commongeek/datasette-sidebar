const sidebarCSS = `
.not-footer{position:relative}
header.hd>nav{margin-left:2rem}

#sidebar-open{position:absolute;top:0;left:0;width:2.6rem;height:2.6rem;box-sizing:border-box;background-color:transparent;cursor:pointer}
#sidebar-open:before{content:"";box-sizing:border-box;width:1rem;height:1rem;border-style:solid;border-color:#fff;border-width:1px 1px 1px 4px;position:absolute;top:.8rem;left:.8rem}

#sidebar-close{position:absolute;top:.65rem;right:.65rem;width:1rem;height:1rem;cursor:pointer}
#sidebar-close:before,#sidebar-close:after{content: '';position:absolute;top:50%;left:50%;width:1rem;height:1px;background-color:black;transform-origin:center}
#sidebar-close::before{transform:translate(-50%, -50%) rotate(45deg)}
#sidebar-close::after{transform: translate(-50%, -50%) rotate(-45deg)}

#sidebar{position:fixed;left:0;top:0;bottom:0;overflow-y:auto;overflow-x:hidden;padding:0 1rem;background-color:#fff;box-shadow:3px 0 5px rgba(0,0,0,0.2);z-index:9999}
#sidebar-hidden-tables>h3{display:none}
#sidebar-hidden-tables[open]>summary{display:none}
#sidebar-hidden-tables[open]>h3{display:block}
`;

const SidebarPlugin = (function() {
    let baseUrl = null;
    let dbName = null;
    let hiddenNames = new Set(['sqlite_sequence', 'sqlite_stat1']);
    let tables = {};
    let views = {};
    let hidden = {};
    let loaded = false;

    function parseCrumbs() {
        const a = document.querySelector('.crumbs a:nth-child(2)');
        if (a) {
            dbName = a.textContent;
            baseUrl = a.href;
        }
    }

    async function loadHiddenNames(database) {
        const url = baseUrl.split('/').slice(0, -1).join('/') + '/-/config.json';
        const resp = await fetch(url);
        const data = await resp.json();
        const tables = data?.databases?.[dbName]?.tables || {};
        for (const [name, table] of Object.entries(tables)) {
            if (table.hidden) {
                hiddenNames.add(name);
            }
        }
    }

    async function query(sql) {
        const url = baseUrl + '/-/query.json?sql=' + encodeURIComponent(sql) + '&_shape=array';
        const resp = await fetch(url);
        const data = await resp.json();
        return data;
    }

    async function loadTablesAndViews() {
        let sql = "SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') AND SUBSTR(name, 1, 1) != '_' ORDER BY name";
        let data = await query(sql);
        for (const row of data) {
            let url = baseUrl + '/' + encodeURIComponent(row.name);
            if (row.type == 'table') {
                if (hiddenNames.has(row.name)) {
                    hidden[row.name] = url;
                } else {
                    tables[row.name] = url;
                }
            } else {
                views[row.name] = url;
            }
        }
    }

    function injectCss() {
        const style = document.createElement('style');
        style.textContent = sidebarCSS;
        document.head.appendChild(style);
    }

    function render() {
        html = '<div><h3>Tables</h3><ul>';
        for (const [name, url] of Object.entries(tables)) {
            html += `<li><a href="${url}">${name}</a></li>`;
        }
        html += '</ul>';
        const hiddenLen = Object.keys(hidden).length;
        if (hiddenLen > 0) {
            html += '<details id="sidebar-hidden-tables">';
            html += `<summary>${hiddenLen} hidden table(s)</summary>`;
            html += '<h3>Hidden tables</h3>';
            html += '<ul>';
            for (const [name, url] of Object.entries(hidden)) {
                html += `<li><a href="${url}">${name}</a></li>`;
            }
            html += '</ul></details>';
        }
        if (Object.keys(views).length > 0) {
            html += '<h3>Views</h3><ul>';
            for (const [name, url] of Object.entries(views)) {
                html += `<li><a href="${url}">${name}</a></li>`;
            }
            html += '</ul>';
        }
        html += '</div>';
        const nav = document.createElement('nav');
        nav.id = 'sidebar';
        nav.innerHTML = html;
        const btn = document.createElement('div');
        btn.id = 'sidebar-close';
        btn.onclick = (ev) => {
            nav.style.display = 'none';
        };
        nav.prepend(btn);
        document.body.prepend(nav);
    }

    async function init() {
        const btn = document.createElement('div');
        btn.id = 'sidebar-open';
        document.querySelector('.not-footer').prepend(btn);
        injectCss();
        document.addEventListener('click', (ev) => {
            const target = ev.target;
            const sidebar = document.getElementById('sidebar');
            if (sidebar && !sidebar.contains(target) && (target.id != 'sidebar-open')) {
                sidebar.style.display = 'none';
            }
        });
        btn.onclick = async (ev) => {
            if (loaded) {
                document.getElementById('sidebar').style.display = 'block';
            } else {
                parseCrumbs();
                if (dbName && baseUrl) {
                    await loadHiddenNames();
                    await loadTablesAndViews();
                    render();
                    loaded = true;
                }
            }
        };
    }

    return {
        'init': init
    }

})();

document.addEventListener('datasette_init', function(ev) {
    if (document.querySelectorAll('.crumbs a').length > 1) {
        SidebarPlugin.init();
    }
});
