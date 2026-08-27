#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void dictionaryParser::init(vector<string>& headers) {}


static vector<string> dictionaryDefaultHeaders = { "id","parentCode","code","name","idx","modifiedBy","lastModified" };
vector<string>& dictionaryParser::getDefaultHeaders() {
	return dictionaryDefaultHeaders;
}

void* dictionaryParser::createInstance() {
	return new Dictionary();
}

void dictionaryParser::deleteInstance(void* obj) {
	delete (Dictionary*)obj;
}

string dictionaryParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	Dictionary * ref = (Dictionary *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "parentCode") { ss << ref->parentCode << "^"; }
		else if (headers[i] == "code") { ss << ref->code << "^"; }
		else if (headers[i] == "name") { ss << ref->name << "^"; }
		else if (headers[i] == "idx") { ss << ref->idx << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else { logUnkonwnField("dictionary", headers[i]); }
	}
	return ss.str();
}

void dictionaryParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	Dictionary * ref = (Dictionary *)obj;
	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "parentCode") { ref->parentCode = value; }
	else if (headers[index] == "code") { ref->code = value; }
	else if (headers[index] == "name") { ref->name = value; }
	else if (headers[index] == "idx") { ref->idx = atoi(value); }
	else if (headers[index] == "codeValue") {}
	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "modifiedBy") {}
	else { logUnkonwnField("dictionary", headers[index]); }
}

