#include <iostream>
#include <fstream>
#include "CrewDB.h"
#include "UtilFunc.h"
#include "Log/Logger.h"
using namespace std;


string trimAndRemoveQuote(string& s);
void readCsv(string path, vector<map<string, string>>& result);

int customBizLoadDataHO(CrewDataContext* dbData) {
	return 0;
}

void readCsv(string path, vector<map<string, string>>& result) {
	vector<string> header;
	vector<string> raw;
	string line;

	ifstream in(path);
	if (!in.good()) {
		in.close();
		Logger::getRuleLogger()->error("invalid file, read fail. {} not found", path);
		return;
	}

	getline(in, line);
	line = trim(line);
	split(line, ',', header);
	for (std::size_t i = 0; i < header.size(); i++) {
		header[i] = trimAndRemoveQuote(header[i]);
	}
	

	while (getline(in, line)) {
		raw.clear();
		split(line, ',', raw);
		for (std::size_t i = 0; i < raw.size(); i++) {
			raw[i] = trimAndRemoveQuote(raw[i]);
		}
		map<string, string> item;
		for (std::size_t i = 0; i < header.size(); i++) {
			item[header[i]] = raw[i];
		}
		result.push_back(item);
	}
	in.close();
}

string trimAndRemoveQuote(string& s) {
	s = trim(s);
	int start = 0;
	int end = (int)s.length() - 1;
	if (s.at(0) == '\'' || s.at(0) == '"')
		start++;
	if (s.at(s.length() - 1) == '\'' || s.at(s.length() - 1) == '"')
		end--;
	return s.substr(start, end);
}