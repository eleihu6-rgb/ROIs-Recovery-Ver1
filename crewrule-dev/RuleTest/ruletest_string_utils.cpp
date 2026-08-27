#include <string>
#include "utils/StringUtils.h"

using namespace std;

string get_warn_message(const string& termLoc, const string& retireLoc) {
	stringstream ss;
	ss << "The crew has invalid rosters after the termination"
		<< (termLoc.empty() ? "" : "({0:termLoc})")
		<< " or retirement date"
		<< (retireLoc.empty() ? "" : "({1:retireLoc})")
		<< ".";
	return StringUtils::Format(ss.str(), termLoc, retireLoc);
}

bool test_string_utils_case() {
	string termLoc = "20211010";
	string retireLoc = "19001010";
	string message = get_warn_message(termLoc, retireLoc);
	std::cout << message << endl;

	termLoc = "";
	retireLoc = "19001010";
	message = get_warn_message(termLoc, retireLoc);
	std::cout << message << endl;

	termLoc = "20211010";
	retireLoc = "";
	message = get_warn_message(termLoc, retireLoc);
	std::cout << message << endl;

	termLoc = "";
	retireLoc = "";
	message = get_warn_message(termLoc, retireLoc);
	std::cout << message << endl;

	return true;
}