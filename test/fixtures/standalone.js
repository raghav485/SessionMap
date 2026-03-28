
  'use strict'

  const Serializer = require('fast-json-stringify/lib/serializer')
  const serializerState = {"mode":"standalone"}
  const serializer = Serializer.restoreFromState(serializerState)

  const validator = null


  module.exports = function anonymous(validator,serializer
) {

    
const {
  asString,
  asNumber,
  asBoolean,
  asDateTime,
  asDate,
  asTime,
  asUnsafeString
} = serializer

const asInteger = serializer.asInteger.bind(serializer)


    const JSON_STR_BEGIN_OBJECT = '{'
    const JSON_STR_END_OBJECT = '}'
    const JSON_STR_BEGIN_ARRAY = '['
    const JSON_STR_END_ARRAY = ']'
    const JSON_STR_COMMA = ','
    const JSON_STR_COLONS = ':'
    const JSON_STR_QUOTE = '"'
    const JSON_STR_EMPTY_OBJECT = JSON_STR_BEGIN_OBJECT + JSON_STR_END_OBJECT
    const JSON_STR_EMPTY_ARRAY = JSON_STR_BEGIN_ARRAY + JSON_STR_END_ARRAY
    const JSON_STR_EMPTY_STRING = JSON_STR_QUOTE + JSON_STR_QUOTE
    const JSON_STR_NULL = 'null'
  
    function main (input) {
      let json = ''
      
    const obj_0 = (input && typeof input.toJSON === 'function')
    ? input.toJSON()
    : input
  
    if (obj_0 === null) {
      json += JSON_STR_EMPTY_OBJECT
    } else {
      json += JSON_STR_BEGIN_OBJECT

      const value_firstName_2 = obj_0["firstName"]
      if (value_firstName_2 !== undefined) {
        
        json += "\"firstName\":"
        
        if (typeof value_firstName_2 !== 'string') {
          if (value_firstName_2 === null) {
            json += JSON_STR_EMPTY_STRING
          } else if (value_firstName_2 instanceof Date) {
            json += JSON_STR_QUOTE + value_firstName_2.toISOString() + JSON_STR_QUOTE
          } else if (value_firstName_2 instanceof RegExp) {
            json += asString(value_firstName_2.source)
          } else {
            json += asString(value_firstName_2.toString())
          }
        } else {
          json += asString(value_firstName_2)
        }
        
      } else {
        throw new Error('"firstName" is required!')
      }
      
    json += JSON_STR_END_OBJECT
  
    }
  
      return json
    }
    
    return main
    
}(validator, serializer)