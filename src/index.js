process.env.SENTRY_DSN =
  process.env.SENTRY_DSN ||
  'https://8939dc7be44d4e34928a23bf709f0251@sentry.cozycloud.cc/98'

const {
  BaseKonnector,
  requestFactory,
  signin,
  scrape,
  saveBills,
  log
} = require('cozy-konnector-libs')
const request = requestFactory({
  cheerio: true,
  json: false,
  jar: true
})

const baseUrl = 'https://secure.fr.vente-privee.com'

module.exports = new BaseKonnector(start)

async function start(fields) {
  log('info', 'Authenticating ...')
  await authenticate(fields.login, fields.password)
  log('info', 'Successfully logged in')

  log('info', 'Fetching the list of commandes')
  const $ = await request(`${baseUrl}/memberaccount/order/`)

  log('info', 'Parsing list of commandes')
  const documents = await parseDocuments($)

  log('info', 'Saving data to Cozy')
  await saveBills(documents, fields, {
    identifiers: ['Vente-privee.com']
  })
}

function authenticate(username, password) {
  return signin({
    url: `https://secure.fr.vente-privee.com/authentication/login/FR?ReturnUrl=https%3a%2f%2fsecure.fr.vente-privee.com%2fns%2ffr-fr%2fhome%2fdefault%2fclassic`,
    formSelector: 'form#authenticationForm',
    formData: { Mail: username, Password: password },
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
    currency: '€',
    vendor: 'Vente Privée',
    metadata: {
      importDate: new Date(),
      version: 1
    }
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
