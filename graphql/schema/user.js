
const _ = require(`lodash`)
const { gql } = require(`apollo-server-koa`)
// let { listSubFields } = require('../../utils.js')
// let { to } = require('../../shared/utils.js')
const validate = require(`validate.js`)

const typeDefs = gql`
  type UserConnection {
    count: Int
    pageCount: Int
    items: [User]
  }

  type User @cacheControl(maxAge: 1) {
    _key: ID!
    _id: ID!
    firstName: String
    lastName: String
    fullName: String
    email: String
    role: String
    createdAt: DateTime
    updatedAt: DateTime
  }

  input UserInput {
    _key: ID
    _id: ID
    firstName: String
    lastName: String
    email: String
    role: String
  }
  input UserPassword {
    _key: ID
    password: String
  }

  extend type Query {
    allUsers (
      page: Int = 1,
      pageSize: Int = 10,
      search: String = "",
      userRole: String = null
    ): UserConnection
    getUser (_key: ID!): User
    usersAutocomplete (
      user_keys: [ID!],
      search: String = ""
    ): [User]
  }

  extend type Mutation {
    upsertUser (user: UserInput!): User
    destroyUser (_key: ID!): User,
    resetPassword (userKey: String!, oldPassword: String!, newPassword: String!, confirmPassword: String!): User
  }
`

const resolvers = {
  Query: {
    allUsers: async function (obj, args, ctx, info) {
      ctx.requireAdmin()

      const offset = args.pageSize * (args.page - 1)
      const search = `%${args.search || ``}%`

      const { items, count } = await ctx.arango.qNext(ctx.aql`
        let items = (
          FOR user IN users
            FILTER
              LIKE(user.firstName, ${search}, true) OR
              LIKE(user.lastName, ${search}, true) OR
              LIKE(user.email, ${search}, true)
            FILTER ${args.userRole} == NULL OR user.role == ${args.userRole}

            SORT user.firstName ASC, user.lastName ASC
            RETURN user
        )

        RETURN {
          items: SLICE(items, ${offset}, ${args.pageSize}),
          count: COUNT(items)
        }
      `)

      return {
        count,
        pageCount: Math.ceil(count / args.pageSize),
        items
      }
    },
    getUser: async function (obj, args, ctx, info) {
      ctx.requireAdmin()

      return ctx.arango.qNext(ctx.aql`
        RETURN DOCUMENT('users', ${args._key})
      `)
    },
    usersAutocomplete: async function (obj, args, ctx, info) {
      const search = args.search ? `%${args.search}%` : `%%`
      const userKeys = args.user_keys || []

      return ctx.arango.qAll(ctx.aql`
        let user_keys = (
          FOR user IN users
            FILTER LIKE(user.firstName, ${search}, true) OR LIKE(user.lastName, ${search}, true) OR LIKE(user.email, ${search}, true)
            SORT user.createdAt DESC
            LIMIT 10
            RETURN user._key
        )

        FOR user IN users
          FILTER user._key IN user_keys OR user._key IN ${userKeys}
          SORT user.createdAt DESC
          RETURN KEEP(user, '_key', 'firstName', 'lastName', 'email')
      `)
    }
  },
  Mutation: {
    upsertUser: async function (obj, args, ctx, info) {
      ctx.requireAdmin()

      let record = args.user

      const report = validate(record, {
        firstName: {
          type: `string`,
          length: { minimum: 1 },
          presence: true
        },
        lastName: {
          type: `string`,
          length: { minimum: 1 },
          presence: true
        },
        email: {
          type: `string`,
          email: true,
          presence: true
        },
        role: {
          type: `string`,
          length: {
            is: 3
          },
          presence: true
        }
      }, { format: `flat` })

      if (_.first(report)) {
        throw new Error(_.first(report))
      }

      record.updatedAt = new Date()

      if (record._key == null) {
        record.createdAt = new Date()
        record = await ctx.arango.qNext(ctx.aql`
          INSERT ${record} INTO users RETURN NEW
        `)
      }

      record = await ctx.arango.qNext(ctx.aql`
        UPDATE ${record._key} WITH ${record} IN users RETURN NEW
      `)

      return record
    },
    destroyUser: async function (obj, args, ctx, info) {
      ctx.requireAdmin()

      await ctx.arango.qNext(ctx.aql`
        REMOVE { _key: ${args._key} } IN users RETURN OLD
      `)
    },
    resetPassword: async function (obj, args, ctx, info) {
      const user = await ctx.arango.qNext(ctx.aql`
        RETURN DOCUMENT('users', ${args.userKey})
      `)

      if (user == null) {
        ctx.userInputError(`User not found`)
      }

      const check = await ctx.bcrypt.checkPassword(args.oldPassword, user.passwordHash)

      if (check.result !== true) {
        ctx.userInputError(`Old password is incorrect`)
      }

      if (_.isEmpty(args.newPassword)) {
        ctx.userInputError(`New password is required`)
      }

      if (args.newPassword.length < 10) {
        ctx.userInputError(`Password must be at least 10 characters`)
      }

      if (args.newPassword !== args.confirmPassword) {
        ctx.userInputError(`New password does not match confirm password`)
      }

      const passwordHash = await ctx.bcrypt.hashPassword(args.newPassword)

      await ctx.arango.q(ctx.aql`
        UPDATE ${args.userKey} WITH { passwordHash: ${passwordHash} } IN users
      `)
    }
  },
  User: {
    fullName: async function (obj, args, ctx, info) {
      return _.compact([obj.firstName, obj.lastName]).join(` `)
    }
  }
}

module.exports = {
  typeDefs,
  resolvers
}
