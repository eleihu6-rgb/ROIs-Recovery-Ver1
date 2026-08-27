#include <sstream>
#include <string.h>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void ruleParser::init(vector<string>& headers) {}

string ruleParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	DBRule * ref = (DBRule *)obj;
	//"", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->idRule << "^"; }
		else if (headers[i] == "function") { ss << ref->function << "^"; }
		else if (headers[i] == "instance") { ss << (ref->idRule % 1000) << "^"; }
		else if (headers[i] == "ruleClass") { ss << ref->classType << "^"; }
		else if (headers[i] == "description") { ss << ref->description << "^"; }
		else if (headers[i] == "reference") { ss << ref->reference << "^"; }
		else if (headers[i] == "category") { ss << ref->category << "^"; }
		else if (headers[i] == "storeStructure") { ss << ref->storeType << "^"; }
		else if (headers[i] == "subversion") { ss << "^"; }
		else if (headers[i] == "source") { ss << ref->source << "^"; }
		else if (headers[i] == "detail") { ss << "^"; }
		else if (headers[i] == "severity") { ss << ref->severity << "^"; }
		else if (headers[i] == "accessibility") { ss << "^"; }
		else if (headers[i] == "overridability") { ss << ref->overridebility << "^"; }
		else if (headers[i] == "isEnabled") { ss << "^"; }
		else if (headers[i] == "isExcluded") { ss << "^"; }
		else if (headers[i] == "ruleApplicability") { ss << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "filiale") { ss << "^"; }
		else if (headers[i] == "subClass") { ss << "^"; }
		else if (headers[i] == "division") { ss << "^"; }
		else if (headers[i] == "exceptionCode") { ss << ref->exceptionCode << "^"; }
		else { logUnkonwnField("rule", headers[i]); }
	}
	return ss.str();
}

void ruleParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	DBRule * ref = (DBRule *)obj;
	if (headers[index] == "id") { ref->idRule = atoll(value); }
	else if (headers[index] == "function") { ref->function = atoi(value); }
	else if (headers[index] == "instance") { }
	else if (headers[index] == "ruleClass") { strncpy(ref->classType, value, sizeof(ref->classType)); }
	else if (headers[index] == "description") { strncpy(ref->description, value, sizeof(ref->description)); }
	else if (headers[index] == "reference") { ref->reference = value; }
	else if (headers[index] == "category") { ref->category = value; }
	else if (headers[index] == "storeStructure") { strncpy(ref->storeType, value, sizeof(ref->storeType)); }
	else if (headers[index] == "subversion") {  }
	else if (headers[index] == "source") { ref->source = value; }
	else if (headers[index] == "detail") { }
	else if (headers[index] == "severity") { ref->severity = atoi(value); }
	else if (headers[index] == "accessibility") {  }
	else if (headers[index] == "overridability") { ref->overridebility = value; }
	else if (headers[index] == "isEnabled") {  }
	else if (headers[index] == "isExcluded") { }
	else if (headers[index] == "ruleApplicability") {}
	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "filiale") {}
	else if (headers[index] == "subClass") {}
	else if (headers[index] == "division") {}
	else if (headers[index] == "owner") {}
	else if (headers[index] == "locked") {}
	else if (headers[index] == "severityColor") {}
	else if (headers[index] == "exceptionCode") { 
		ref->exceptionCode = value; 
		if (!ref->exceptionCode.empty()) {
			split(ref->exceptionCode.c_str(), '|', ref->exceptionCodes);
		}
	}
	else { logUnkonwnField("rule", headers[index]); }
}

void* ruleParser::createInstance() {
	return new DBRule();
}

void ruleParser::deleteInstance(void* obj) {
	delete (DBRule*)obj;
}

static vector<string> flightCompositionDefaultHeaders = { "id", "function", "instance", "ruleClass", "description",
"reference", "category", "storeStructure", "subversion", "source", "detail", "severity",
"accessibility", "overridability", "isEnabled", "isExcluded", "ruleApplicability", "lastModified", "modifiedBy", "subClass",
"filiale","division","exceptionCode"};
vector<string>& ruleParser::getDefaultHeaders() {
	return flightCompositionDefaultHeaders;
}
