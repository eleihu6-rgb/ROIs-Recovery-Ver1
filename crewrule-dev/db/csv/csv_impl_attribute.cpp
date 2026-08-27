#include <sstream>
#include <string.h>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void attributeParser::init(vector<string>& headers) {}


static vector<string> attributeDefaultHeaders = { "id", "airline", "code", "type", "name", "isVisible", "operation",
"lastModified", "modifiedBy", "filiale", "division" };
vector<string>& attributeParser::getDefaultHeaders() {
	return attributeDefaultHeaders;
}

void* attributeParser::createInstance() {
	return new csvAttribute();
}

void attributeParser::deleteInstance(void* obj) {
	delete (csvAttribute*)obj;
}

string attributeParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	csvAttribute * ref = (csvAttribute *)obj;
	//"", "", "", "", "", ""
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "airline") { ss << ref->airline << "^"; }
		else if (headers[i] == "code") { ss << ref->code << "^"; }
		else if (headers[i] == "type") { ss << ref->type << "^"; }
		else if (headers[i] == "name") { ss << ref->name << "^"; }
		else if (headers[i] == "operation") { ss << ref->operation << "^"; }
		else if (headers[i] == "source") { ss << ref->source << "^"; }
		else if (headers[i] == "isVisible") { ss << (ref->isVisible ? "true" : "false") << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "filiale") { ss << "^"; }
		else if (headers[i] == "division") { ss << "^"; }
		else { logUnkonwnField("attribute", headers[i]); }
	}
	return ss.str();
}

void attributeParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	csvAttribute * ref = (csvAttribute *)obj;
	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "airline") { ref->airline = value; }
	else if (headers[index] == "code") { ref->code = value; }
	else if (headers[index] == "type") { ref->type = value; }
	else if (headers[index] == "name") { ref->name = value; }
	else if (headers[index] == "operation") { ref->operation = value; }
	else if (headers[index] == "source") { ref->source = value; }
	else if (headers[index] == "isVisible") { ref->isVisible = (0 == strncmp("true", value, 4)); }
	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "filiale") {}
	else if (headers[index] == "division") {}
	else { logUnkonwnField("attribute", headers[index]); }
}

