#include <sstream>
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

static vector<string> ScenarioDefaultHeaders = { "id", "name", "type", "category", "division", "creationDate", "status", "period",
"lastModified", "modifiedBy" };
vector<string>& worksetParser::getDefaultHeaders() {
	return ScenarioDefaultHeaders;
}

void worksetParser::init(vector<string>& headers) {}

void* worksetParser::createInstance() {
	return new csvWorkset();
}

void worksetParser::deleteInstance(void* obj) {
	delete (csvWorkset*)obj;
}

string worksetParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	csvWorkset * ref = (csvWorkset *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "name") { ss << ref->name << "^"; }
		else if (headers[i] == "type") { ss << ref->type << "^"; }
		else if (headers[i] == "category") { ss << ref->category << "^"; }
		else if (headers[i] == "division") { ss << ref->division << "^"; }
		else if (headers[i] == "creationDate") { ss << "^"; }
		else if (headers[i] == "status") { ss << "^"; }
		else if (headers[i] == "period") { ss << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "createdBy") { ss << "^"; }
		else if (headers[i] == "createdDt") { ss << "^"; }
		else if (headers[i] == "filiale") { ss << "^"; }
		else { logUnkonwnField("Workset", headers[i]); }
	}
	return ss.str();
}

void worksetParser::fromCsv(vector<string>& headers, int i, char* value, void* obj) {
	csvWorkset * ref = (csvWorkset *)obj;

	if (headers[i] == "id") { ref->id = atoll(value); }
	else if (headers[i] == "name") {ref->name = value; }
	else if (headers[i] == "type") { ref->type = value; }
	else if (headers[i] == "category") { ref->category = value; }
	else if (headers[i] == "division") { ref->division = value; }
	else if (headers[i] == "creationDate") {}
	else if (headers[i] == "status") {}
	else if (headers[i] == "period") {}
	else if (headers[i] == "lastModified") {}
	else if (headers[i] == "modifiedBy") {}
	else if (headers[i] == "createdBy") {}
	else if (headers[i] == "createdDt") {}
	else if (headers[i] == "filiale") { ref->filiale = value; }
	else { logUnkonwnField("Workset", headers[i]); }
}

