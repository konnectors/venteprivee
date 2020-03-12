process.env.SENTRY_DSN =
  process.env.SENTRY_DSN ||
  'https://8939dc7be44d4e34928a23bf709f0251@sentry.cozycloud.cc/98'

const {
  BaseKonnector,
  requestFactory,
  scrape,
  log
} = require('cozy-konnector-libs')

const request = requestFactory({
  // debug: true,
  cheerio: true,
  json: false,
  jar: true,
  headers: {
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'fr,fr-FR;q=0.8,en-US;q=0.5,en;q=0.3'
  }
})

const VENDOR = 'Vente Privée'

const baseUrl = 'https://www.veepee.fr'

module.exports = new BaseKonnector(start)

async function start(fields) {
  log('info', 'Authenticating ...')
  await authenticate.bind(this)(fields.login, fields.password)
  log('info', 'Successfully logged in')

  log('info', 'Fetching the list of commandes')
  const $ = await request(`${baseUrl}/memberaccount/order/`)

  log('info', 'Parsing list of commandes')
  const documents = await parseDocuments($)

  log('info', 'Saving data to Cozy')
  await this.saveBills(documents, fields, {
    linkBankOperations: false,
    fileIdAttributes: ['vendorRef']
  })
}

function authenticate(username, password) {
  return this.signin({
    requestInstance: request,
    url: baseUrl + '/authentication/',
    formSelector: 'form#authenticationForm',
    formData: { Email: username, Password: password },
    validate: (statusCode, $) => !$('#mdp').length
  })
}

function parseDocuments($) {
  const docs = scrape(
    $,
    {
      date: {
        sel: 'td.td2',
        parse: text => normalizeDate(text)
      },
      filename: {
        sel: 'td.td2',
        parse: text => normalizeFileName(text)
      },
      amount: {
        sel: 'td.td3',
        parse: normalizePrice
      },
      fileurl: {
        sel: 'td.td6 a.billOrder',
        attr: 'href',
        parse: src => (src ? `${baseUrl}/${src}` : null)
      },
      vendorRef: {
        sel: 'td.td6 a.billOrder',
        attr: 'href',
        parse: src => {
          if (!src) return null
          return new URL(`${baseUrl}/${src}`).searchParams.get('orderId')
        }
      }
    },
    'tbody .tableLine1'
  ).filter(doc => doc.fileurl)

  for (let doc of docs) {
    doc.filename =
      'VentePrivee_' +
      doc.filename +
      '_' +
      String(doc.amount).replace('.', ',') +
      '.pdf'
  }

  return docs.map(doc => ({
    ...doc,
    vendor: VENDOR
  }))
}

/**
 * convert a price string to a float
 */
function normalizePrice(price) {
  price = price.replace(',', '.')
  return parseFloat(price.replace('€', '').trim())
}

/**
 * Il est impossible d'avoir une commande avant 2001
 * date de création de la société => toutes les dates
 * seront donc converties pour être dans les années 2000
 */
function normalizeDate(date) {
  date = date.split('/')
  date = new Date(
    Number.parseInt(date[2]) + 2000 + '-' + date[1] + '-' + date[0]
  )
  return date
}

/**
 * convert date to string for filename
 */
function normalizeFileName(date) {
  date = normalizeDate(date)
  const filename = date.toISOString().slice(0, 10)
  return filename
}
