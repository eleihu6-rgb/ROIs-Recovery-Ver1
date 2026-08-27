#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void tmTrainingConfigParser::init(vector<string>& headers) {}

static vector<string> tmTrainingConfigDefaultHeaders = { "id","category","tmName","parentId","tmCode","displayOrder","description","enableStatus","lastModified","modifiedBy" };
vector<string>& tmTrainingConfigParser::getDefaultHeaders() {
	return tmTrainingConfigDefaultHeaders;
}

void* tmTrainingConfigParser::createInstance() {
	return new TmTrainingConfig();
}

void tmTrainingConfigParser::deleteInstance(void* obj) {
	delete (TmTrainingConfig*)obj;
}

string tmTrainingConfigParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	TmTrainingConfig * ref = (TmTrainingConfig *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {

		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "category") { ss << ref->category << "^"; }
		else if (headers[i] == "tmName") { ss << ref->tmName << "^"; }
		else if (headers[i] == "parentId") { ss << ref->parentId << "^"; }
		else if (headers[i] == "tmCode") { ss << ref->tmCode << "^"; }
		else if (headers[i] == "displayOrder") { ss << ref->displayOrder << "^"; }
		else if (headers[i] == "description") { ss << ref->description << "^"; }
		else if (headers[i] == "enableStatus") { ss << (ref->enableStatus ? "1" : "0") << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else { logUnkonwnField("tmTrainingConfig", headers[i]); }
	}
	return ss.str();
}

void tmTrainingConfigParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	TmTrainingConfig * ref = (TmTrainingConfig *)obj;

	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "category") { ref->category = (value == NULL || strlen(value) == 0) ? "" : strToUpper(value); }
	else if (headers[index] == "tmName") { ref->tmName = value; }
	else if (headers[index] == "parentId") { ref->parentId = atoll(value); }
	else if (headers[index] == "tmCode") { ref->tmCode = value; }
	else if (headers[index] == "displayOrder") { ref->displayOrder = atoi(value); }
	else if (headers[index] == "description") { ref->description = value; }
	else if (headers[index] == "enableStatus") { ref->enableStatus = (atoi(value) == 1); }
	else if (headers[index] == "modifiedBy") { }
	else if (headers[index] == "lastModified") { }
	else { logUnkonwnField("tmTrainingConfig", headers[index]); }
}

