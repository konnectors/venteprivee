const {
  BaseKonnector,
  requestFactory,
  signin,
  scrape,
  saveBills,
  log
} = require('cozy-konnector-libs')
const  request = requestFactory({
  cheerio: true,
  json: false,
  jar: true
})

require('request-debug')(request);

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
    validate: (statusCode, $, fullResponse) => {
      log('info', statusCode)
      return statusCode === 200 || log('error', 'Invalid credentials')
    }
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
        parse: src => `${baseUrl}/${src}`
      } 
    },
    'tbody .tableLine1'
  )

  for (let doc of docs) {
    doc.filename = doc.filename + '_'+ doc.amount + '.pdf'
  }

  return docs.map(doc => ({
    ...doc,
    currency: '€',
    vendor: 'template',
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
  date = new Date(Number.parseInt(date[2]) + 2000, date[1], date[0])
  return date
}

/** 
 * convert date to string for filename
*/
function normalizeFileName(date) {
  date = date.split('/')
  date = Number.parseInt(date[2]) + 2000 + "-" + date[1] + "-" + date[0]
  filename = new Date(date).toISOString().slice(0,10)
  return date
}
