
import _ from 'lodash'
import { getField, updateField } from 'vuex-map-fields'

export const state = function () {
  return {
    history: {
      page: 1,
      pageSize: 10,
      taskKeys: [],
      taskSearch: ``,
      search: ``
    },
    tasks: {
      page: 1,
      pageSize: 25,
      search: ``
    },
    users: {
      page: 1,
      pageSize: 10,
      search: ``,
      userRole: null
    },
    'entries-index': {
      page: 1,
      pageSize: 10,
      entryTypes: [`warning`, `error`]
    },

    pageSizeOptions: [10, 25, 50]
  }
}

export const mutations = {
  updateField,
  set: function (state, payload) {
    Object.entries(payload).forEach(function ([key, val]) {
      _.set(state, key, val)
    })
  }
}

export const actions = {
}

export const getters = {
  getField
}
