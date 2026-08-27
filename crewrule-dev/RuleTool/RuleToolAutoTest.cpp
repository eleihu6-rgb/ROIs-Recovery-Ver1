/*
RuleTool模块：自动测试
1、遍历输入dir下子目录
2、每一个目录作为一个 test case，读入其中input.txt
3、输入output.txt
4、与 expect_output.txt对比
*/
#include <sys/stat.h> 
#include <stdio.h>
#include <time.h>
#ifdef WIN32
#include <direct.h>
#endif
//#include <direct.h>
#include <algorithm>
#include <fstream>
#include "RuleTool.h"
#include "FileDirUtil.h"
//#include "UtilFunc.h"
#include "UtilFunc.h"
#include "JsonPairing.h"
#include "JsonParser/JsonParser.h"
#include "rapidjson/document.h"

string findInFileListByName(vector<string>& fileList, string targetName);
int readExpectPairings(const char* jsonFilePath, map<long long, Pairing*>& result);
int checkPairingAndCompareToExpect(shared_ptr<CrewDataContext>& dataCtx,
	shared_ptr<LegalityChecker> ruleEngine,
	string outputFileCheckPairing,
	map<long long, Pairing*>& expectPairingValues,
	map<long long, vector<RULE_VIOLATION*>>& expectPairingViolations);

int autotest_run_case(string dir, string testCaseName, vector<string>& report) {
	int ret = 0;
	ofstream out;
	ifstream in;
	vector<RULE_LEGALITY *> checkList;
	stringstream ssExpectOutputPath;
	stringstream ssInputPath;
	stringstream ssOutputPath;
	stringstream ss;
	string inputPath;
	shared_ptr<CrewDataContext> dataCtx(new CrewDataContext(CREW_APP_TYPE_RULESRV,false));
	shared_ptr<LegalityChecker> ruleEngine(new LegalityChecker());
	map<string, int> outputViolation;
	map<string, int> expectViolation;
	map<long long, Pairing*> expectPairings;
	vector<string> outputNotMatchExpectMsgs;
	map<long long, vector<RULE_VIOLATION*>> pairingViolations;
	map<long long, vector<RULE_VIOLATION*>> expectPairingViolations;
	//string testCaseFileName;
	vector<string> fileList = get_all_files_names_within_folder(dir);

	//testcase文件名匹配，允许testcase/test_case/scenario
	string inputFile = findInFileListByName(fileList, "loadScenario.data.txt");
	string outputFileCheckPairing = findInFileListByName(fileList, "checkPairing.txt");
	cout << "dir=" << dir << endl;

	//load csv & init ruleEngine
	ssInputPath << dir << "/" << inputFile;
	inputPath = ssInputPath.str();
	ret = dataCtx->loadDataCsv(inputPath.c_str());
	if (ret != 0) {
		goto CLEANUP;
	}
	ruleEngine->setDataContext(dataCtx);

	//check pairing & compare expect
	outputFileCheckPairing = dir + "/" + outputFileCheckPairing;
	ret = checkPairingAndCompareToExpect(dataCtx, ruleEngine, outputFileCheckPairing, expectPairings, expectPairingViolations);

	//check every crew
	for (std::size_t index = 0; index < dataCtx->crewList.size(); index++)
	{
		checkList.push_back(new RULE_LEGALITY);
		checkList[index]->PairingIndex = -1;
		checkList[index]->RosterIndex = -1;
		checkList[index]->crewIndex = (int)index;// lc->getCrewIndex(crewId);
	}
	ruleEngine->checkRules(checkList);

	//output.txt
	ssOutputPath << dir << "/output.txt";
	out.open(ssOutputPath.str());
	if (!out) {
		ret = ERR_FILE_OPEN_FAIL;
		goto CLEANUP;
	}
	for (RULE_VIOLATION* rv : ruleEngine->getRuleViolations()) {
		//cout << rv->idRule << "," << rv->crewId << "," << utcToUtcString(rv->startDTUtc) << "," << utcToUtcString(rv->endDTUtc) << "\r\n";
		out << rv->idRule << "," << rv->crewId << ",utc:" << utcToUtcString(rv->startDTUtc) << ",utc:" << utcToUtcString(rv->endDTUtc) << "\n";
	}
	out.close();

	//对比预期结果
	//1、将output/expect放入map
	//2、对比map
	{
		for (RULE_VIOLATION* rv : ruleEngine->getRuleViolations()) {
			ss.str("");//clear
			ss << rv->idRule << "," << rv->crewId << ",utc:" << utcToUtcString(rv->startDTUtc) << ",utc:" << utcToUtcString(rv->endDTUtc);
			outputViolation[ss.str()] = 1;
		}
		ssExpectOutputPath << dir << "/expect_output.txt";
		in.open(ssExpectOutputPath.str());
		if (!in) {
			//若文except文件不存在，则根据 output生成
			out.open(ssExpectOutputPath.str());
			for (RULE_VIOLATION* rv : ruleEngine->getRuleViolations()) {
				ss.str("");
				ss << rv->idRule << "," << rv->crewId << ",utc:" << utcToUtcString(rv->startDTUtc) << ",utc:" << utcToUtcString(rv->endDTUtc);
				expectViolation[ss.str()] = 1;
				out << ss.str() << "\n";
			}
			out.close();

			ss.str("");
			ss << testCaseName << " expect_output.txt not found, copy output.txt expect_output.txt";
			outputNotMatchExpectMsgs.push_back(ss.str());
			ret = ERR_FILE_OPEN_FAIL;
		}
		else {
			string line;
			while (getline(in, line)) {
				expectViolation[line] = 1;
			}
			in.close();
		}
		//对比
		for (auto& item : outputViolation) {
			if (expectViolation.find(item.first) == expectViolation.end()) {
				ss.str("");
				ss << testCaseName << " violation not expect: " << item.first;
				outputNotMatchExpectMsgs.push_back(ss.str());
			}
		}
		for (auto& item : expectViolation) {
			if (outputViolation.find(item.first) == outputViolation.end()) {
				ss.str("");
				ss << testCaseName << " expect violation not found: " << item.first;
				outputNotMatchExpectMsgs.push_back(ss.str());
			}
		}
		//report
		if (outputNotMatchExpectMsgs.empty()) {
			ss.str("");
			ss << testCaseName << " SUCCESS";
			report.push_back(ss.str());
			ret = 0;
		}
		else {
			ss.str("");
			ss << testCaseName << " FAIL";
			report.push_back(ss.str());
			report.insert(report.end(), outputNotMatchExpectMsgs.begin(), outputNotMatchExpectMsgs.end());
			ret = ERR_RULE_AUTOTEST;
		}
	}

CLEANUP:
	//clear mem
	for (auto& item : checkList) {
		delete item;
	}
	return ret;
}

int RuleTool::autoTest(string dir) {
	int ret = 0;
	ofstream reportFile;
	vector<string> report;
	vector<string> fileList = get_all_dir_names_within_folder(dir);
	int countSuccess = 0;
	int countFail = 0;
	sort(fileList.begin(), fileList.end(), [](string a, string b)->bool{ return a.compare(b) < 0; });


	for (string filename : fileList) {
		if (filename == "." || filename == "..") {
			continue;
		}
		else {
			stringstream ss;
			ss << dir << "/" << filename;
			string filepath = ss.str();


			struct stat s = { 0 };
			stat(filepath.c_str(), &s);

			if (s.st_mode & S_IFDIR)
			{
				printf("DIR  %s\n", filepath.c_str());
				try {
					ret = autotest_run_case(filepath, filename, report);
					if (ret == 0)
						countSuccess++;
					else
						countFail++;
				}
				catch (char * ex) {
					report.push_back(filename + " exception");
					printf("ERROR: general exception, msg=%s, test case=%s\n", ex, filename.c_str());
					countFail++;
				}
				catch (exception& ex) {
					report.push_back(filename + " exception");
					printf("ERROR: general exception, msg=%s, test case=%s\n", ex.what(), filename.c_str());
					countFail++;
				}
				catch (...) {
					report.push_back(filename + " exception");
					printf("ERROR: general exception, test case=%s\n", filename.c_str());
					countFail++;
				}
			}
		}
	}

	//print report
	reportFile.open("report.txt");
	if (reportFile) {
		reportFile << "TOTAL COUNT success=" << countSuccess << "  fail=" << countFail << "\n\n";
		for (auto& item : report) {
			reportFile << item << "\n";
		}
		reportFile.close();
	}
	return ret;
}


string findInFileListByName(vector<string>& fileList, string targetName) {

	string testCaseFileName = "";
	for (string filename : fileList) {
		if (filename == "." || filename == "..") {
			continue;
		}
		if (filename.find(targetName) != string::npos) {
			testCaseFileName = filename; break;
		}
		
		if (testCaseFileName != "") break;
	}
	return testCaseFileName;
}

int readExpectPairings(const char* jsonFilePath, map<long long, Pairing*>& result) {
	int ret = 0;
	vector<Pairing*> list;
	rapidjson::Document doc;
	ret = readFile_PairingList(jsonFilePath, list, doc);
	if (ret != 0)
		return ret;
	
	for (Pairing* p : list) {
		result[p->getDbId()] = p;
	}
	return ret;
}

int checkPairingAndCompareToExpect(shared_ptr<CrewDataContext>& dataCtx, 
									shared_ptr<LegalityChecker> ruleEngine, 
									string outputFileCheckPairing, 
									map<long long, Pairing*>& expectPairingValues,
									map<long long, vector<RULE_VIOLATION*>>& expectPairingViolations) {

	int ret = readExpectPairings(outputFileCheckPairing.c_str(), expectPairingValues);
	if (ret != 0) {
		return ret;
	}
	//check every pairing
	for (Pairing* p : dataCtx->pairingList) {
		vector<int> temp;
		bool isLegal = ruleEngine->checkPGRules(p, temp, PAIRING_EDITOR);
		for (auto& violation : ruleEngine->getRuleViolations()) {
			long long pairingId = violation->pairingId;
			if (pairingId == p->getDbId()) {
				if (expectPairingViolations.find(pairingId) == expectPairingViolations.end())
					expectPairingViolations.insert(make_pair(pairingId, vector<RULE_VIOLATION*>()));
				expectPairingViolations[pairingId].push_back(new RULE_VIOLATION(*violation)); //make copy & keep in pairingViolations
			}
		}
	}

	//log expect violation
	for (auto& it : expectPairingViolations) {
		for (auto& violation : it.second) {
			cout << "**DBG expectPairingViolation " << violation->pairingId << " "
				<< violation->idRule << " "
				<< utcToUtcString(violation->startDTUtc) << " "
				<< utcToUtcString(violation->endDTUtc) << " "
				<< violation->violation_msg
				<< endl;
		}
	}
	//log duty 5-values
	for (Pairing* p : dataCtx->pairingList) {
		for (Duty* d : p->getDutyVec()) {
			cout << "**DBG expectPairingValues    " << p->getDbId() << " "
				<< " DUTY "
				<< utcToUtcString(d->getStartTimeLocSch())
				<< d->getDepartureStation() << "->" << d->getArrivalStation() << " "
				<< " brief=" << d->getMinBrief() << "/" << d->getMinDebrief()
				<< " pick=" << d->getMinPickup() << "/" << d->getMinDropoff()
				<< " blk=" << d->getPlanBlockTime()
				<< " fdp=" << d->getPlanFDP()
				<< " dp=" << d->getPlanDP()
				<< " rst=" << d->getMinRest()
				<< endl;
		}
	}
	return ret;
}
