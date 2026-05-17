// state.js
let rows = [];
let filters = { dateFrom: null, dateTo: null, streamers: new Set(), brands: new Set() };
let pageSize = 50;
let currentPage = 1;
let modalMode = 'add';