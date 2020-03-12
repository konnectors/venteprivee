process.env.SENTRY_DSN =
  process.env.SENTRY_DSN ||
  'https://8939dc7be44d4e34928a23bf709f0251@sentry.cozycloud.cc/98'

const { CookieKonnector, scrape, log } = require('cozy-konnector-libs')

const VENDOR = 'Vente Privée'

const baseUrl = 'https://www.veepee.fr'

class VeepeeConnector extends CookieKonnector {
  async testSession() {
    if (!this._jar._jar.toJSON().cookies.length) {
      return false
    }
    log('info', 'Testing session')
    const $ = await this.request(`${baseUrl}/memberaccount/order/`)
    const result = !$('#mdp').length
    if (!result) {
      log('info', 'Saved session usage failed')
    } else {
      log('info', 'Saved session OK')
    }
    return result
  }

  async fetch(fields) {
    if (!(await this.testSession())) {
      await this.authenticate(fields.login, fields.password)
    }

    log('info', 'Fetching the list of commandes')
    const $ = await this.request(`${baseUrl}/memberaccount/order/`)

    log('info', 'Parsing list of commandes')
    const documents = await this.parseDocuments($)

    log('info', 'Saving data to Cozy')
    await this.saveBills(documents, fields, {
      linkBankOperations: false,
      fileIdAttributes: ['vendorRef']
    })
  }

  authenticate(username, password) {
    return this.signin({
      requestInstance: this.request,
      url: baseUrl + '/authentication/login?ReturnUrl=%2fmemberaccount%2forder',
      formSelector: 'form#authenticationForm',
      formData: {
        Email: username,
        Mail: username,
        Password: password,
        RememberMe: 'true'
      },
      validate: (statusCode, $) => !$('#mdp').length
    })
  }

  parseDocuments($) {
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
}

const connector = new VeepeeConnector({
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

connector.run()

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
