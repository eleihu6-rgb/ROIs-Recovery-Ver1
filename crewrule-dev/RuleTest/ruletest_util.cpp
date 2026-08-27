
#include <string>
#include <map>
#include <algorithm>
#include "ruletest_util.h"
#include "UtilFunc.h"
#include "CustomBiz/CustomBiz.h"

using namespace std;

#define ss(s) ((char*)s.c_str())

#define TIME_ZONE_PEK (8*3600)
static long long _g_flt_id_generator = -1;

bool isNodeLine(string line);

Segment* makeSegment(string assigment, string fltNum, string date, string dep, string arv, string fleet, string tail, string std, string sta, string atd, string ata) {
	Segment * seg = new Segment();

	seg->setDBId(_g_flt_id_generator--);
	seg->setSegmentId(_g_flt_id_generator);

	seg->setAssignment(assigment);
	seg->setFlightNumber(fltNum);
	seg->setDepSta(dep);
	seg->setArrSta(arv);
	seg->setFleetCD(fleet);
	seg->setTailNum(tail);

	seg->setStartTimeLocSch(utcStrToUtc((char*)std.c_str()));
	seg->setEndTimeLocSch(utcStrToUtc((char*)sta.c_str()));
	seg->setStartTimeUtcSch(utcStrToUtc((char*)std.c_str()) - TIME_ZONE_PEK);
	seg->setEndTimeUtcSch(utcStrToUtc((char*)sta.c_str()) - TIME_ZONE_PEK);

	seg->setStartTimeLocAct(utcStrToUtc((char*)atd.c_str()));
	seg->setEndTimeLocAct(utcStrToUtc((char*)ata.c_str()));
	seg->setStartTimeUtcAct(utcStrToUtc((char*)atd.c_str()) - TIME_ZONE_PEK);
	seg->setEndTimeUtcAct(utcStrToUtc((char*)ata.c_str()) - TIME_ZONE_PEK);

	return seg;
}

Segment* makeSeg(string assignment, string fltNum, string dep, string arv, string stdStr, string staStr) {
	time_t std = utcStrToUtc(ss(stdStr));
	string date = utcToUtcDtString(std);

	Segment * s = makeSegment(assignment, fltNum, date, dep, arv, "738", "738-01", stdStr, staStr, stdStr, staStr);
	return s;
}

//生成seg, eg. FLY,9800,PEK,SHA,2017-1-1 08:00:00,2017-1-1 10:00:00
Segment* makeSeg(string str) {

	vector<string> words;
	split(str.c_str(), ',', words);

	string assignment = words[0];
	string fltnum = words[1];
	string dep = words[2];
	string arv = words[3];
	string std = words[4];
	string sta = words[5];

	Segment* seg = makeSeg(assignment, fltnum, dep, arv, std, sta);
	return seg;
}

//生成dutynode, eg. BRIEF,2017-1-1 06:30:00
shared_ptr<PairingDutyNode> makeDutyNode(string str) {

	vector<string> words;
	split(str.c_str(), ',', words);

	time_t nodeTime = utcStrToUtc((char*)words[1].c_str());

	shared_ptr<PairingDutyNode> node(new PairingDutyNode);
	node->setNode(words[0]);
	if (words[0] == "BRIEF" || words[0] == "PICKUP") {
		node->setStartLoc(nodeTime);
		node->setStartUtc(nodeTime - TIME_ZONE_PEK);
	}
	else {
		node->setEndLoc(nodeTime);
		node->setEndUtc(nodeTime - TIME_ZONE_PEK);
	}
	return node;
}

//某位置之前是否存在 seg，用于区分dutynode type=DUTY|SEGMENT
Segment* findSegExistBefore(vector<Activity*>& items, int index) {
	for (int i = 0; i < index; i++) {
		Activity* item = items[i];
		if (item->getClassName() == "Segment")
			return (Segment*)item;
	}
	return nullptr;
}
//某位置之后是否存在 seg，用于区分dutynode type=DUTY|SEGMENT
Segment* findSegExistAfter(vector<Activity*>& items, int index) {
	for (std::size_t i = index+1; i < items.size(); i++) {
		Activity* item = items[i];
		if (item->getClassName() == "Segment")
			return (Segment*)item;
	}
	return nullptr;
}
//
//从segment创建duty，创建默认brief|debrief，计算fdp，计算休息
Duty * makeDuty(vector<string>& lines, LegalityChecker* ruleEngine) {
	//
	//汇总集合
	vector<Segment*> segs;
	vector<shared_ptr<PairingDutyNode>> nodes;
	//
	//辅助集合，帮助建立 node与 seg衔接关系，如 fromSegmentId, toSegmentId等
	vector<Activity*> segAndNodes;
	//
	//循环line，分别建立seg、dutynode
	for (string str : lines) {
		if (isNodeLine(str)) {
			shared_ptr<PairingDutyNode> node = makeDutyNode(str);
			nodes.push_back(node);
			segAndNodes.push_back(node.get());
			node->setSequence((int)nodes.size());
		}
		else {
			Segment* currentSeg = makeSeg(str);
			segs.push_back(currentSeg);
			segAndNodes.push_back(currentSeg);
		}
	}
	//
	//补齐dutynode缺失字段：type=DUTY|SEGMENT, DEBRIEF|DROPOFF=start, BRIEF|PICKUP=end
	for (std::size_t i = 0; i < segAndNodes.size(); i++) {
		Activity* item = segAndNodes[i];
		if (item->getClassName() == "Segment") {
			continue;
		}
		PairingDutyNode* node = (PairingDutyNode*)item;
		//level: duty or segment
		Segment* segBefore = findSegExistBefore(segAndNodes, (int)i);
		Segment* segAfter = findSegExistAfter(segAndNodes, (int)i);
		if (!segBefore || !segAfter) {
			node->setType("DUTY");
		}
		else {
			node->setType("SEGMENT");
			node->setFromSegmentId(segBefore->getSegmentId());
			node->setToSegmentId(segAfter->getSegmentId());
		}
		//
		//time: brief.end, debrief.start
		if (node->getNode() == "BRIEF" || node->getNode() == "PICKUP") {
			if (i < segAndNodes.size() - 1) {
				Activity* next = segAndNodes[i + 1];
				node->setEndLoc(next->getStartTimeLocAct());
				node->setEndUtc(next->getStartTimeUtcAct());
			}
		}
		else {
			if (i > 0) {
				Activity* prev = segAndNodes[i - 1];
				node->setStartLoc(prev->getEndTimeLocAct());
				node->setStartUtc(prev->getEndTimeUtcAct());
			}
		}
	}

	Duty* d = new Duty(segs);
	d->setDepartureStation(segs[0]->getDepSta());
	d->setArrivalStation(segs[segs.size() - 1]->getArrSta());
	d->setAssignment("FLY");

	SharedPtr<CrewDataContext> dbData = ruleEngine->getCrewContext();

	//brief,debrief, FDP
	ruleEngine->basicSetting(d, "");
	if (nodes.size() == 0) {
		createPairingNodeOfDuty(d, dbData.get());
		createPairingNodeOfSeg(d, dbData.get());
	}
	else {
		d->pairingDutyNodes = nodes;
	}
	calculatePairingDutyTimes(d, dbData.get());

	//休息
	for (auto& ruleItem : dbData->getRuleFunctions(2124)) {
		ruleEngine->setMinRest(d, &ruleItem);
	}
	return d;
}

//
//遍历 segStrs, 连续seg收集到segsInSameDuty，创建duty
vector<Duty*> makeDuties(vector<string>& segStrs, LegalityChecker* ruleEngine) {
	vector<Duty*> result;
	vector<string> segsInSameDuty;
	
	for (std::size_t i = 0; i < segStrs.size(); i++) {
		string line = trim(segStrs[i]);
		//
		//DUTY或空行表示 旧duty结束新duty开始
		if (line != "" && toUpper(line) != "DUTY"){
			segsInSameDuty.push_back(line);
		}
		if (line == "" || toUpper(line) == "DUTY" || i == segStrs.size() - 1) {
			if (segsInSameDuty.size() > 0) {
				Duty* duty = makeDuty(segsInSameDuty, ruleEngine);
				result.push_back(duty);
				segsInSameDuty.clear();
			}
		}
	}

	return result;
}

Pairing* makePairing(vector<string>& ptnSegStrs, LegalityChecker* ruleEngine) {
	
	vector<Duty*> duties = makeDuties(ptnSegStrs, ruleEngine);

	string FLY = "FLY";
	Pairing* pg = new Pairing(duties);
	map<string, int> comp;
	pg->setComplements(comp);
	pg->setPrimeActivity(FLY);


	return pg;
}


//替换ruleParam为 test case内定义值, 代替csv读入数据
//按输入 item替换 dbData中法规，只保留一行DBRule，且参数按目标为准
void replaceRuleItem(ruleParams* item, int function, shared_ptr<CrewDataContext> dbData) {
	shared_ptr<ruleParams> ruleItem(item);

	auto& list = dbData->getRuleFunctions(function);
	DBRule first = list[0];
	first.function = function;
	first.parsedParam = ruleItem;
	const_cast<vector<DBRule>&>(list).clear();
	const_cast<vector<DBRule>&>(list).push_back(first);

	vector<std::size_t> foundIndex;
	for (std::size_t i = 0; i < dbData->ruleList.size(); i++) {
		auto& rule = dbData->ruleList[i];
		if (rule.function == function) {
			foundIndex.push_back(i);
		}
	}
	//remove old item from last
	//for (auto it = dbData->ruleList.rbegin(); it != dbData->ruleList.rend(); it++) {
	//	auto item = it.base();
	//	if (item->function == function) {
	//		dbData->ruleList.erase(item);
	//	}
	//}
	dbData->ruleList.erase(std::remove_if(dbData->ruleList.begin(), dbData->ruleList.end(), [function](const DBRule& rule) {return rule.function == function; }), dbData->ruleList.end());
	dbData->ruleList.push_back(first);
	
}


void printPtnStr(string ptnStr) {
	vector<string> lines;
	split(ptnStr.c_str(), '\n', lines);
	for (string& line : lines) {
		vector<string> segStrs;
		split(trim(line).c_str(), '|', segStrs);
		for (string& segStr : segStrs) {
			cout << "\n" << trim(segStr);
		}
		cout << endl; //duty间空行
	}
	cout << endl; //ptn末尾空行
}

//计算：BH, FDP, DP；
//生成：dutyNode
void calcAndInitDuty(Duty* duty, LegalityChecker* ruleEngine) {

	//计算FDP DP BH
	ruleEngine->basicSetting(duty, "");

	//生成DutyNode
	createPairingNodeOfDuty(duty, ruleEngine->getDataContext().get());
}

//是否dutynode行
bool isNodeLine(string line) {
	size_t idxBrief = line.find("BRIEF");
	size_t idxDebrief = line.find("DEBRIEF");
	size_t idxPickup = line.find("PICKUP");
	size_t idxDropoff = line.find("DROPOFF");
	if (idxBrief != string::npos ||
		idxDebrief != string::npos ||
		idxPickup != string::npos ||
		idxDropoff != string::npos
		) {
		return true;
	}
	else {
		return false;
	}
}