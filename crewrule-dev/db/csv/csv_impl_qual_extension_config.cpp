#include <sstream>
#include "UtilFunc.h"
#include "csv_impl.h"
#include "CrewDB.h"

static vector<string> qualExtensionConfigHeaders = { "id", "qualification", "assignments", "expiredBeforeDays", "extensionTime", "extensionUnit", "lastModified", "modifiedBy" };
vector<string>& qualExtensionConfigParser::getDefaultHeaders() {
	return qualExtensionConfigHeaders;
}

void qualExtensionConfigParser::init(vector<string>& headers) {}

void* qualExtensionConfigParser::createInstance() {
	return new QualExtensionConfig();
}

void qualExtensionConfigParser::deleteInstance(void* obj) {
	delete (QualExtensionConfig*)obj;
}

string qualExtensionConfigParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	QualExtensionConfig* ref = (QualExtensionConfig*)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << "^"; }
		else if (headers[i] == "qualification") { ss << joinStrList(ref->qualifications, "|") << "^"; }
		else if (headers[i] == "assignments") { ss << joinStrList(ref->assignments, "|") << "^"; }
		else if (headers[i] == "expiredBeforeDays") { ss << ref->expiredBeforeDays << "^"; }
		else if (headers[i] == "extensionTime") { ss << ref->extensionTime << "^"; }
		else if (headers[i] == "extensionUnit") { ss << ref->extensionUnit << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else { logUnkonwnField("qual_extension_config", headers[i]); }
	}
	return ss.str();
}

void qualExtensionConfigParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	QualExtensionConfig* ref = (QualExtensionConfig*)obj;
	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "qualification") { split(value, '|', ref->qualifications); }
	else if (headers[index] == "assignments") { split(value, '|', ref->assignments); }
	else if (headers[index] == "expiredBeforeDays") { ref->expiredBeforeDays = atoi(value); }
	else if (headers[index] == "extensionTime") { ref->extensionTime = atoi(value); }
	else if (headers[index] == "extensionUnit") { ref->extensionUnit = value; }
	else if (headers[index] == "lastModified") { }
	else if (headers[index] == "modifiedBy") { }
	else { logUnkonwnField("qual_extension_config", headers[index]); }
}

