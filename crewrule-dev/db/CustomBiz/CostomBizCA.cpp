#include <iostream>
#include <fstream>
#include <string.h>
#include <algorithm>
#include "CrewDB.h"
#include "UtilFunc.h"
#include "csv/csv_reader.h"
#include "Log/Logger.h"

using namespace std;

//20191229 ain, demo: 读取特别数据段
//1. 实现 csvReader子类，getParser/getParserName留空
//2. 调用 reader.readSingleTableFromCsv()，读取csv中特定数据段，
//3. output参数 result存放读取结果，读取结果为 vector<string>
//4. 正常定制需求，只需修改 if (isTargetTable)逻辑分支内容
string trimAndRemoveQuote1(string& s);
class CACCCsvReader : public csvReader {
public:
	CACCCsvReader() {}//继承、实现空函数
	shared_ptr<csvParser> getParser(string tableName) { return NULL; }//继承、实现空函数
	string getParserName(string tableName) { return ""; }//继承、实现空函数

	void readSingleTableFromCsv(string filepath, string tableName, map<long, map<string, string>>& result);
	void readSingleTableFromCsv2(string filepath, string tableName, map<string, map<string, int>>& result);
	void readSingleTableFromCsv3(string filepath, string tableName, map<long long, map<long long,int>>& result);
	void readSingleTableFromCsv4(string filepath, string tableName, vector<StudentsInfoForPreLockTeacher*>&studentsInfoForPreLockTeacherVec);
	void readSingleTableFromCsv5(string filepath, string tableName, map<string, map<string, double>>& result);
	void readSingleTableFromCsv6(string filepath, string tableName, vector<HistoryTeachingHoursForCACCInitialTeaching*>& historyTeachingHoursForCACCInitialTeachingVec);
};
void CACCCsvReader::readSingleTableFromCsv5(string filepath, string tableName, map<string, map<string, double>>& result)
{
	bool isTargetTable = false;
	ifstream in(filepath); Logger::getRuleLogger()->info("parse csv start");

	while (in.good()) {
		string line = readLine(in);
		if (line.empty()) {
			//skip empty line
		}
		//line for table header: init table & headers
		else if (line.substr(0, strnlen(TableSeparator, 100)) == TableSeparator) {
			//if (line.find(tableName)!=string::npos)
			if (line.substr(strnlen(TableSeparator, 100)).find(tableName) == 0)
				isTargetTable = true;
			else
				isTargetTable = false;
		}
		else {
			if (isTargetTable) {
				//处理目标数据段内容, 按业务需求自行实现每一行如何处理
				//这里以陈坚 cacc需求为例
				vector<string> raw;
				split(line, '^', raw);
				for (std::size_t i = 0; i < raw.size(); i++) {
					raw[i] = trimAndRemoveQuote1(raw[i]);
				}
				string field1 = raw[0].c_str();
				string field2 = raw[1].c_str();
				double field3 = atof(raw[2].c_str());
				result[field1][field2] = field3;
			}
		}
	}

	in.close();
}
void CACCCsvReader::readSingleTableFromCsv6(string filepath, string tableName, vector<HistoryTeachingHoursForCACCInitialTeaching*>& historyTeachingHoursForCACCInitialTeachingVec)
{
	bool isTargetTable = false;
	ifstream in(filepath); Logger::getRuleLogger()->info("parse csv start");

	while (in.good()) {
		string line = readLine(in);
		if (line.empty()) {
			//skip empty line
		}
		//line for table header: init table & headers
		else if (line.substr(0, strnlen(TableSeparator, 100)) == TableSeparator) {
			if (line.substr(strnlen(TableSeparator, 100)).find(tableName) == 0)
				isTargetTable = true;
			else
				isTargetTable = false;
		}
		else {
			if (isTargetTable) {
				//处理目标数据段内容, 按业务需求自行实现每一行如何处理
				//这里以陈坚 cacc需求为例
				vector<string> raw;
				split(line, '^', raw);
				for (std::size_t i = 0; i < raw.size(); i++) {
					raw[i] = trimAndRemoveQuote1(raw[i]);
				}
				HistoryTeachingHoursForCACCInitialTeaching* r = new HistoryTeachingHoursForCACCInitialTeaching();
				r->teacherId = raw[1];
				r->teachingHours = atof(raw[2].c_str())/60;
				r->teachingNumSegs = atoi(raw[3].c_str());
				r->year = raw[4];
				r->month = raw[5];
				historyTeachingHoursForCACCInitialTeachingVec.push_back(r);
			}
		}
	}

	in.close();
}
void CACCCsvReader::readSingleTableFromCsv4(string filepath, string tableName, vector<StudentsInfoForPreLockTeacher*>&studentsInfoForPreLockTeacherVec)
{
	bool isTargetTable = false;
	ifstream in(filepath); Logger::getRuleLogger()->info("parse csv start");

	while (in.good()) {
		string line = readLine(in);
		if (line.empty()) {
			//skip empty line
		}
		//line for table header: init table & headers
		else if (line.substr(0, strnlen(TableSeparator, 100)) == TableSeparator) {
			if (line.substr(strnlen(TableSeparator, 100)).find(tableName) == 0)
				isTargetTable = true;
			else
				isTargetTable = false;
		}
		else {
			if (isTargetTable) {
				//处理目标数据段内容, 按业务需求自行实现每一行如何处理
				//这里以陈坚 cacc需求为例
				vector<string> raw;
				split(line, '^', raw);
				for (std::size_t i = 0; i < raw.size(); i++) {
					raw[i] = trimAndRemoveQuote1(raw[i]);
				}
				StudentsInfoForPreLockTeacher* r = new StudentsInfoForPreLockTeacher();
				r->crewTeam = raw[0];
				r->teachingStartTime = raw[1];
				r->teamNames = raw[2];
				r->fleets = raw[3];
				r->numStudents = atoi(raw[4].c_str());
				studentsInfoForPreLockTeacherVec.push_back(r);
			}
		}
	}

	in.close();
}
void CACCCsvReader::readSingleTableFromCsv3(string filepath, string tableName, map<long long, map<long long, int>>& result)
{
	bool isTargetTable = false;
	ifstream in(filepath); Logger::getRuleLogger()->info("parse csv start");

	while (in.good()) {
		string line = readLine(in);
		if (line.empty()) {
			//skip empty line
		}
		//line for table header: init table & headers
		else if (line.substr(0, strnlen(TableSeparator, 100)) == TableSeparator) {
			if (line.substr(strnlen(TableSeparator, 100)).find(tableName) == 0)
				isTargetTable = true;
			else
				isTargetTable = false;
		}
		else {
			if (isTargetTable) {
				//处理目标数据段内容, 按业务需求自行实现每一行如何处理
				//这里以陈坚 cacc需求为例
				vector<string> raw;
				split(line, '^', raw);
				for (std::size_t i = 0; i < raw.size(); i++) {
					raw[i] = trimAndRemoveQuote1(raw[i]);
				}
				int field1 = atoi(raw[0].c_str());
				int field2 = atoi(raw[1].c_str());
				int field3 = atoi(raw[2].c_str());
				result[field1][field2] = field3;
			}
		}
	}

	in.close();
}
void CACCCsvReader::readSingleTableFromCsv2(string filepath, string tableName, map<string, map<string, int>>& result)
{
	bool isTargetTable = false;
	ifstream in(filepath); Logger::getRuleLogger()->info("parse csv start");

	while (in.good()) {
		string line = readLine(in);
		if (line.empty()) {
			//skip empty line
		}
		//line for table header: init table & headers
		else if (line.substr(0, strnlen(TableSeparator, 100)) == TableSeparator) {
			if (line.substr(strnlen(TableSeparator, 100)).find(tableName) == 0)
				isTargetTable = true;
			else
				isTargetTable = false;
		}
		else {
			if (isTargetTable) {
				//处理目标数据段内容, 按业务需求自行实现每一行如何处理
				//这里以陈坚 cacc需求为例
				vector<string> raw;
				split(line, '^', raw);
				for (std::size_t i = 0; i < raw.size(); i++) {
					raw[i] = trimAndRemoveQuote1(raw[i]);
				}
				string field1 = raw[0];
				string field2 = raw[1];
				int field3 = atoi(raw[2].c_str());

				result[field1][field2] = field3;
			}
		}
	}

	in.close();
}
void CACCCsvReader::readSingleTableFromCsv(string filepath, string tableName, map<long, map<string, string>>& result) {

	bool isTargetTable = false;
	ifstream in(filepath); Logger::getRuleLogger()->info("parse csv start");

	while (in.good()) {
		string line = readLine(in);
		if (line.empty()) {
			//skip empty line
		}
		//line for table header: init table & headers
		else if (line.substr(0, strnlen(TableSeparator, 100)) == TableSeparator) {
			if (line.substr(strnlen(TableSeparator, 100)).find(tableName) == 0)
				isTargetTable = true;
			else
				isTargetTable = false;
		}
		else {
			if (isTargetTable) {
				//处理目标数据段内容, 按业务需求自行实现每一行如何处理
				//这里以陈坚 cacc需求为例
				vector<string> raw;
				split(line, '^', raw);
				long field1 = atol(raw[0].c_str());
				string field2 = raw[1];
				string field3 = raw[2];

				result[field1][field2] = field3;
			}
		}
	}

	in.close();
}

void readCsv(string path, map<string, map<string, int>>& result);
void readCsv2(string path, map<string, int>& result);
void readCsv3(string path, vector<StudentsInfoForPreLockTeacher*>&studentsInfoForPreLockTeacherVec);
void readCsv4(string path, map<string, pair<time_t, time_t>>&crewIdToStartAndEndTime);
void readCsv5(string path, map<long long, map<long long, int>>&koreaAndJapanExpatFlightToCompIdToCount);
void readCsv6(string path, map<string, map<string, double>>&result);
void customBizLoadDataCA(CrewDataContext* dbData)
{
	//crewIdToFltNumToCount: 读取 crewToNumFlightInHistory.csv
	map<string, map<string, int>>crewIdToFltNumToCount;
	//map<string, int>numHistoryFlyFlightsOnCrew;
	map<string, map<string, int>>numEachMonthOfFlyPairingOnCrew;
	map<string, map<string, double>>numEachMonthOfFlyHoursOnCrew;
	map<string, int>crewHasTeachingTaskInLastPeriod;
	//map<string, int>koreaAndJapanExpatFlightToCompId;
	map<long long, map<long long,int>>koreaAndJapanExpatFlightToCompIdToCount;
	//DBG ADD crewIdToStartAndEndTime START
	map<string, pair<time_t, time_t>> crewIdToStartAndEndTime;
	//DBG ADD crewIdToStartAndEndTime END
	vector<StudentsInfoForPreLockTeacher*>studentsInfoForPreLockTeacherVec;
	vector<HistoryTeachingHoursForCACCInitialTeaching*> historyTeachingHoursForCACCInitialTeachingVec;
	/*readCsv("crewToNumFlightInHistory.csv", crewIdToFltNumToCount);
	readCsv("numHistoryFlyPairingOnCrew.csv", numEachMonthOfFlyPairingOnCrew);
	readCsv2("crewHasTeachingTaskInLastPeriod.csv", crewHasTeachingTaskInLastPeriod);
	readCsv3("studentsInfoForPreLockTeacher.csv", studentsInfoForPreLockTeacherVec);
	readCsv4("CrewIdToPreLockedTrainingPeriods.csv", crewIdToStartAndEndTime);
	readCsv5("koreaAndJapanExpatFlightCompostion.csv", koreaAndJapanExpatFlightToCompIdToCount);
	readCsv6("numHistoryFlyhoursOnCrew.csv", numEachMonthOfFlyHoursOnCrew);*/
	CACCCsvReader csvReader;
	csvReader.readSingleTableFromCsv2("ro_input.txt", "CrewToFlightNumHistory", crewIdToFltNumToCount);
	csvReader.readSingleTableFromCsv2("ro_input.txt", "CrewToPairingCountHistory", numEachMonthOfFlyPairingOnCrew);
	csvReader.readSingleTableFromCsv3("ro_input.txt", "koreaAndJapanExpatFlightCompostion", koreaAndJapanExpatFlightToCompIdToCount);
	csvReader.readSingleTableFromCsv4("ro_input.txt", "studentsInfoForPreLockTeacher", studentsInfoForPreLockTeacherVec);
	csvReader.readSingleTableFromCsv5("ro_input.txt", "CrewFlyHoursHistory", numEachMonthOfFlyHoursOnCrew);
	csvReader.readSingleTableFromCsv6("ro_input.txt", "InitialTeachingHistoryData", historyTeachingHoursForCACCInitialTeachingVec);
	dbData->crewIdToFltNumToCountForCA_INT.swap(crewIdToFltNumToCount);
	//dbData->numHistoryFlyFlightsOnCrew.swap(numHistoryFlyFlightsOnCrew);
	dbData->studentsInfoForPreLockTeacherVec.swap(studentsInfoForPreLockTeacherVec);
	dbData->crewHasTeachingTaskInLastPeriod.swap(crewHasTeachingTaskInLastPeriod);
	dbData->crewIdToNumEachMonthHistoryFlyPairingForCA_INT.swap(numEachMonthOfFlyPairingOnCrew);
	dbData->koreaAndJapanExpatFlightToCompIdToCount.swap(koreaAndJapanExpatFlightToCompIdToCount);
	dbData->crewIdToStartAndEndTime.swap(crewIdToStartAndEndTime);
	dbData->crewIdToEachMonthFlyHoursOnCrewForCA_INT.swap(numEachMonthOfFlyHoursOnCrew);
	dbData->historyTeachingHoursForCACCInitialTeachingVec.swap(historyTeachingHoursForCACCInitialTeachingVec);
}
void readCsv5(string path, map<long long, map<long long, int>>&result)
{
	vector<string> header;
	vector<string> raw;
	string line;

	ifstream in(path);
	if (!in.good()) {
		in.close();
		Logger::getRuleLogger()->error("ERROR: invalid file, read fail. {} not found", path);
		return;
	}

	getline(in, line);
	line = trim(line);
	split(line, ',', header);
	for (std::size_t i = 0; i < header.size(); i++) {
		header[i] = trimAndRemoveQuote1(header[i]);
	}
	while (getline(in, line)) {
		raw.clear();
		split(line, ',', raw);
		for (std::size_t i = 0; i < raw.size(); i++) {
			raw[i] = trimAndRemoveQuote1(raw[i]);
		}
		long long fltId = 0;
		long long compId = 0;
		int multiplier = 0;
		for (std::size_t i = 0; i < header.size(); i++) {
			if (header[i] == "FLT_ID")
			{
				fltId = atoll(raw[i].c_str());
			}
			else if (header[i] == "COMP_ID")
			{
				compId = atoll(raw[i].c_str());
			}
			else if (header[i] == "MULTIPLIER")
			{
				multiplier = atoi(raw[i].c_str());
			}
		}
		result[fltId][compId] += multiplier;
	}
	in.close();
}
void readCsv4(string path, map<string, pair<time_t, time_t>>&result)
{
	vector<string> header;
	vector<string> raw;
	string line;

	ifstream in(path);
	if (!in.good()) {
		in.close();
		cout << "ERROR: invalid file, read " << path << " fail" << endl;
		return;
		//Logger::getRuleLogger()->error("invalid file, " + path + " not found");
	}

	getline(in, line);
	line = trim(line);
	split(line, ',', header);
	for (std::size_t i = 0; i < header.size(); i++) {
		header[i] = trimAndRemoveQuote1(header[i]);
	}
	while (getline(in, line)) {
		raw.clear();
		split(line, ',', raw);
		for (std::size_t i = 0; i < raw.size(); i++) {
			raw[i] = trimAndRemoveQuote1(raw[i]);
		}
		string crewId = "";
		string fltNum = "";
		//string comp = "00000";
		time_t startTime = 0;
		time_t endTime = 0;
		for (std::size_t i = 0; i < header.size(); i++) {
			if (header[i] == "CREW_ID")
			{
				crewId = /*comp + */raw[i].c_str();
			}
			else if (header[i] == "PreLockedTrainingPeriodsStart")
			{
				startTime = utcStrToUtc((char *)raw[i].c_str());
			}
			else if (header[i] == "PreLockedTrainingPeriodsEnd")
			{
				endTime = utcStrToUtc((char *)raw[i].c_str());
			}
		}
		result[crewId] = make_pair(startTime, endTime);
	}
	in.close();
}
void readCsv3(string path, vector<StudentsInfoForPreLockTeacher*>&studentsInfoForPreLockTeacherVec)
{
	vector<string> header;
	vector<string> raw;
	string line;

	ifstream in(path);
	if (!in.good()) {
		in.close();
		cout << "ERROR: invalid file, read " << path << " fail" << endl;
		return;
		//Logger::getRuleLogger()->error("invalid file, " + path + " not found");
	}

	getline(in, line);
	line = trim(line);
	split(line, ',', header);
	for (std::size_t i = 0; i < header.size(); i++) {
		header[i] = trimAndRemoveQuote1(header[i]);
	}

	while (getline(in, line)) {
		raw.clear();
		split(line, ',', raw);
		for (std::size_t i = 0; i < raw.size(); i++) {
			raw[i] = trimAndRemoveQuote1(raw[i]);
		}
		int count = 0;
		StudentsInfoForPreLockTeacher* r = new StudentsInfoForPreLockTeacher;
		for (std::size_t i = 0; i < header.size(); i++) {
			if (header[i] == "crewTeam")
			{
				r->crewTeam = raw[i];
			}
			else if (header[i] == "teachingStartTime")
			{
				r->teachingStartTime = raw[i];
			}
			else if (header[i] == "teamNames")
			{
				r->teamNames = raw[i];
			}
			else if (header[i] == "fleets")
			{
				r->fleets=raw[i];
			}
			else if (header[i] == "numStudents")
			{
				r->numStudents = atoi(raw[i].c_str());
			}
		}
		studentsInfoForPreLockTeacherVec.push_back(r);
	}
	in.close();
}
void readCsv2(string path, map<string, long long>& result)
{
	vector<string> header;
	vector<string> raw;
	string line;

	ifstream in(path);
	if (!in.good()) {
		in.close();
		cout << "ERROR: invalid file, read " << path << " fail" << endl;
		return;
		//Logger::getRuleLogger()->error("invalid file, " + path + " not found");
	}

	getline(in, line);
	line = trim(line);
	split(line, ',', header);
	for (std::size_t i = 0; i < header.size(); i++) {
		header[i] = trimAndRemoveQuote1(header[i]);
	}
	if ("numHistoryFlyFlightsOnCrew.csv" == path)
	{
		while (getline(in, line)) {
			raw.clear();
			split(line, ',', raw);
			for (std::size_t i = 0; i < raw.size(); i++) {
				raw[i] = trimAndRemoveQuote1(raw[i]);
			}
			string crewId = "";
			string fltNum = "";
			//string comp = "00000";
			int count = 0;
			for (std::size_t i = 0; i < header.size(); i++) {
				if (header[i] == "CREW_ID")
				{
					crewId = /*comp + */raw[i].c_str();
				}
				else if (header[i] == "NUM")
				{
					count = atoi(raw[i].c_str());
				}
			}
			result[crewId] = count;
		}
	}
	else if ("crewHasTeachingTaskInLastPeriod.csv" == path)
	{
		while (getline(in, line)) {
			raw.clear();
			split(line, ',', raw);
			for (std::size_t i = 0; i < raw.size(); i++) {
				raw[i] = trimAndRemoveQuote1(raw[i]);
			}
			string crewId = "";
			string fltNum = "";
			//string comp = "00000";
			int count = 0;
			for (std::size_t i = 0; i < header.size(); i++) {
				if (header[i] == "CREW_ID")
				{
					crewId = /*comp + */raw[i].c_str();
				}
			}
			result[crewId] = 1;
		}
	}
	else if ("koreaAndJapanExpatFlightCompostion.csv" == path)
	{
		while (getline(in, line)) {
			raw.clear();
			split(line, ',', raw);
			for (std::size_t i = 0; i < raw.size(); i++) {
				raw[i] = trimAndRemoveQuote1(raw[i]);
			}
			string fltNum = "";
			long long compId = 0;
			for (std::size_t i = 0; i < header.size(); i++) {
				if (header[i] == "FLT_ID")
				{
					fltNum = raw[i].c_str();
				}
				else if (header[i] == "COMP_ID")
				{
					compId = atoll(raw[i].c_str());
				}
			}
			result[fltNum] = compId;
		}
	}
	in.close();
}
void readCsv6(string path, map<string, map<string, double>>&result)
{
	vector<string> header;
	vector<string> raw;
	string line;

	ifstream in(path);
	if (!in.good()) {
		in.close();
		cout << "ERROR: invalid file, read " << path << " fail" << endl;
		return;
		//Logger::getRuleLogger()->error("invalid file, " + path + " not found");
	}

	getline(in, line);
	line = trim(line);
	split(line, ',', header);
	for (std::size_t i = 0; i < header.size(); i++) {
		header[i] = trimAndRemoveQuote1(header[i]);
	}
	map<long long, map<string, int>> item;
	while (getline(in, line)) {
		raw.clear();
		split(line, ',', raw);
		for (std::size_t i = 0; i < raw.size(); i++) {
			raw[i] = trimAndRemoveQuote1(raw[i]);
		}
		string crewId = "";
		string month = "";
		//string comp = "00000";
		double hours = 0;
		for (std::size_t i = 0; i < header.size(); i++) {
			if (header[i] == "CREW_ID")
			{
				crewId = /*comp + */raw[i].c_str();
			}
			else if (header[i] == "MON")
			{
				month = raw[i];
			}
			else if (header[i] == "FLYHOURS")
			{
				hours = atof(raw[i].c_str());
			}
		}
		result[crewId][month] = hours;
	}
	in.close();
}
void readCsv(string path, map<string, map<string, int>>& result) {
	vector<string> header;
	vector<string> raw;
	string line;

	ifstream in(path);
	if (!in.good()) {
		in.close();
		cout << "ERROR: invalid file, read " << path << " fail" << endl;
		return;
		//Logger::getRuleLogger()->error("invalid file, " + path + " not found");
	}

	getline(in, line);
	line = trim(line);
	split(line, ',', header);
	for (std::size_t i = 0; i < header.size(); i++) {
		header[i] = trimAndRemoveQuote1(header[i]);
	}
	if ("crewToNumFlightInHistory.csv" == path)
	{
		map<long long, map<string, int>> item;
		while (getline(in, line)) {
			raw.clear();
			split(line, ',', raw);
			for (std::size_t i = 0; i < raw.size(); i++) {
				raw[i] = trimAndRemoveQuote1(raw[i]);
			}
			string crewId = "";
			string fltNum = "";
			//string comp = "00000";
			int count = 0;
			for (std::size_t i = 0; i < header.size(); i++) {
				if (header[i] == "CREW_ID")
				{
					crewId = /*comp +*/ raw[i].c_str();
				}
				else if (header[i] == "ATTRIBUTES")
				{
					string temp = raw[i];
					int t_start = static_cast<int>(temp.find("INT") + 4);
					int t_end = static_cast<int>(temp.find("INT", t_start + 1, 3) - 2);
					int sizeFltNum = t_end - t_start + 1;
					fltNum = raw[i].substr(t_start, sizeFltNum);
				}
				else if (header[i] == "COUNT(*)")
				{
					count = atoi(raw[i].c_str());
				}
			}
			result[crewId][fltNum] += count;
		}
	}
	else if ("numHistoryFlyPairingOnCrew.csv" == path)
	{
		map<long long, map<string, int>> item;
		while (getline(in, line)) {
			raw.clear();
			split(line, ',', raw);
			for (std::size_t i = 0; i < raw.size(); i++) {
				raw[i] = trimAndRemoveQuote1(raw[i]);
			}
			string crewId = "";
			string month = "";
			//string comp = "00000";
			int count = 0;
			for (std::size_t i = 0; i < header.size(); i++) {
				if (header[i] == "CREW_ID")
				{
					crewId = /*comp + */raw[i].c_str();
				}
				else if (header[i] == "MON")
				{
					month = raw[i];
				}
				else if (header[i] == "NUM")
				{
					count = atoi(raw[i].c_str());
				}
			}
			result[crewId][month] = count;
		}
	}
	in.close();
}

string trimAndRemoveQuote1(string& s) {
	s = trim(s);
	int start = 0;
	int end = (int)s.length();
	if (s.at(0) == '\'' || s.at(0) == '"' || s.at(0) == '\"')
		start++;
	if (s.at(s.length() - 1) == '\'' || s.at(s.length() - 1) == '"' || s.at(s.length() - 1) == '\"')
	{
		end-=2;
	}
		
	return s.substr(start, end);
}

//op#2426, CA定制, CACCDOM筛选输入ptn，只保留一天按 scenario.endDt
void filterPairingForCACCDOM(CrewDataContext* dbData) {
	int RUN_MODE_CACCDOM = 1004;
	vector<int>& runMode = dbData->scenario.runMode;
	if (find(runMode.begin(), runMode.end(), RUN_MODE_CACCDOM) != runMode.end()) {

		time_t minUtc = dbData->scenario.endDtUTC ;
		time_t maxUtc = dbData->scenario.endDtUTC + 24 * 3600;
		vector<Pairing*> result;
		for (auto pg : dbData->pairingListForRO) {
			if (pg->getStartTimeUtcAct() >= minUtc && pg->getStartTimeUtcAct() < maxUtc) {
				result.push_back(pg);
			}
		}
		dbData->pairingListForRO = result;
	}
}