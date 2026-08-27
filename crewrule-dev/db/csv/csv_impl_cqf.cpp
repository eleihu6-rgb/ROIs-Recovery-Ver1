#include <sstream>
#include <string.h>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void cqfParser::init(vector<string>& headers) {}


string cqfParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	DBRule * ref = (DBRule *)obj;
	//"id", "function", "instance", "", "description", "reference", "category", "isEnabled", "storeStructure", "source", "detailDisplay"
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->idRule << "^"; }
		else if (headers[i] == "function") { ss << ref->function << "^"; }
		else if (headers[i] == "instance") { ss << "^"; }
		else if (headers[i] == "cqfClass") { ss << ref->classType << "^"; }
		else if (headers[i] == "description") { ss << ref->description << "^"; }
		else if (headers[i] == "reference") { ss << "^"; }
		else if (headers[i] == "category") { ss << "^"; }
		else if (headers[i] == "isEnabled") { ss << "^"; }
		else if (headers[i] == "storeStructure") { ss << ref->storeType << "^"; }
		else if (headers[i] == "subversion") { ss << "^"; }
		else if (headers[i] == "source") { ss << ref->source << "^"; }
		else if (headers[i] == "detailDisplay") { ss << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "filiale") { ss << "^"; }
		else if (headers[i] == "division") { ss << "^"; }
		else if (headers[i] == "subClass") { ss << "^"; }
		else { logUnkonwnField("cqf", headers[i]); }
	}
	return ss.str();
}

void cqfParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	DBRule * ref = (DBRule *)obj;
	if (headers[index] == "id") { ref->idRule = atoll(value); }
	else if (headers[index] == "function") { ref->function = atoi(value); }
	else if (headers[index] == "instance") {}
	else if (headers[index] == "cqfClass") { strncpy(ref->classType, value, sizeof(ref->classType)); }
	else if (headers[index] == "description") { strncpy(ref->description, value, sizeof(ref->description)); }
	else if (headers[index] == "reference") {}
	else if (headers[index] == "category") {}
	else if (headers[index] == "isEnabled") {}
	else if (headers[index] == "storeStructure") { strncpy(ref->storeType, value, sizeof(ref->storeType)); }
	else if (headers[index] == "subversion") {}
	else if (headers[index] == "source") { ref->source = value; }
	else if (headers[index] == "detailDisplay") {}
	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "filiale") {}
	else if (headers[index] == "division") {}
	else if (headers[index] == "subClass") {}
	else if (headers[index] == "owner") {}
	else if (headers[index] == "locked") {}
	else { logUnkonwnField("cqf", headers[index]); }
}

void* cqfParser::createInstance() {
	return new DBRule();
}

void cqfParser::deleteInstance(void* obj) {
	delete (DBRule*)obj;
}

static vector<string> flightCompositionDefaultHeaders = { "id", "function", "instance", "cqfClass", "description",
"reference", "category", "isEnabled", "storeStructure", "source", "detailDisplay", "lastModified", "modifiedBy", "filiale",
"division", "subClass" };
vector<string>& cqfParser::getDefaultHeaders() {
	return flightCompositionDefaultHeaders;
}