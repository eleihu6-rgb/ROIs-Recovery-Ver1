#include <iostream>
#include <fstream>
#include <memory>
#include <algorithm>
#include "CrewDB.h"
#include "RuleTool.h"
#include "UtilFunc.h"

using namespace std;

/**
//1. 读入输入，如 文件模式po_input.txt、server模式rest api
//2. flight按 minLTMinutes 分组
*/

class PoAnalysFlightConnect {
public:
	PoAnalysFlightConnect(time_t startUtc, time_t endUtc, int minConnectTimeMinutes, vector<Segment*>& flts);

	void process();
	void writeResult();
	void writeResultLT();
	void writeResultLO();
private:
	int minConnectTimeMinutes;
	time_t startUtc;
	time_t endUtc;
	vector<vector<Segment*>> datas;
	map<long long, int> fltShortConnectCount; //flt_id -> shortConnCount
	map<long long, Segment*> fltIdMap;

	void add(Segment* flt);
	void writeFltGroup(ostream& out);
	void writeFltShortConnectCount(ostream& out);
	void writeAirportNeedLongTransitOrLayover(ofstream& out);

};


PoAnalysFlightConnect::PoAnalysFlightConnect(time_t startUtc, time_t endUtc, int minConnectTimeMinutes, vector<Segment*>& flts) {
	cout << "PO analys init..." << endl;
	this->startUtc = startUtc;
	this->endUtc = endUtc;
	this->minConnectTimeMinutes = minConnectTimeMinutes;
	//
	//计算分组个数
	time_t minStart = 0;
	time_t maxEnd = 0;
	for (auto& f : flts) {
		if (f->getStartTimeUtcAct() > maxEnd)
			maxEnd = f->getStartTimeUtcAct();
		if (f->getStartTimeUtcAct() < minStart || minStart == 0)
			minStart = f->getStartTimeUtcAct();
	}
	int size = static_cast<int>((maxEnd - minStart) / (60 * minConnectTimeMinutes)) + 1;
	this->datas.resize(size);
	for (int i = 0; i < size; i++) {
		this->datas[i] = vector<Segment*>();
	}
	//
	//按时间加入分组
	for (auto& flt : flts) {
		add(flt);
	}
	cout << "PO analys init end" << endl;
}

void PoAnalysFlightConnect::process() {
	cout << "PO analys processing..." << endl;
	for (std::size_t i = 0; i < datas.size(); i++) {
		cout << "PO analys process " << utcToUtcString(startUtc + i * 60 * this->minConnectTimeMinutes) << endl;
		
		//
		//收集相邻两个分组：对于分组内每一航班，对比当前组内和下一分组的航班

		//
		//计算每一航班可用备选短连接数
		for (auto& f : datas[i]) {

			int index = static_cast<int>((f->getEndTimeUtcAct() - startUtc) / (60 * this->minConnectTimeMinutes));
			if (index >= (int)datas.size()) {
				continue;
			}
			vector<Segment*> relativeFlts;
			//for (auto& f : datas[index]) {
			//	relativeFlts.push_back(f);
			//}
			relativeFlts.insert(relativeFlts.end(), datas[index].begin(), datas[index].end());
			if (index < (int)datas.size() - 1) {
				for (auto& f : datas[index + 1]) {
					relativeFlts.push_back(f);
				}
				//relativeFlts.insert(relativeFlts.end(), datas[i + 1]->begin(), datas[i + 1]->end());
			}

			int shortConnectCount = 0;
			for (auto& f2 : relativeFlts) {
				if (f->getArrSta() == f2->getDepSta()
					&& (f2->getStartTimeUtcAct() - f->getEndTimeUtcAct()) / 60 <= this->minConnectTimeMinutes)
					shortConnectCount++;
			}
			fltShortConnectCount[f->getDBId()] = shortConnectCount;
		}
	}
	cout << "PO analys processing end" << endl;
}

void PoAnalysFlightConnect::writeResult() {
	cout << "PO analys result..." << endl;
	//
	//输出结果
	cout << "output: analys_flight_grp_by_time.txt" << endl;
	ofstream fileFltGrp("analys_flight_grp_by_time.txt");
	writeFltGroup(fileFltGrp);
	fileFltGrp.close();

	cout << "output: analys_flight_min_conn_count.csv" << endl;
	ofstream fileFltMinConn("analys_flight_min_conn_count.csv");
	writeFltShortConnectCount(fileFltMinConn);
	fileFltMinConn.close();

}


void PoAnalysFlightConnect::writeResultLT() {

	string filename = "analys_airport_need_LT.txt";
	cout << "output: " << filename << endl;
	ofstream file3(filename);
	writeAirportNeedLongTransitOrLayover(file3);
	file3.close();
}
void PoAnalysFlightConnect::writeResultLO() {

	string filename = "analys_airport_need_LO.txt";
	cout << "output: " << filename << endl;
	ofstream file3(filename);
	writeAirportNeedLongTransitOrLayover(file3);
	file3.close();
}

void PoAnalysFlightConnect::add(Segment* flt) {
	if (!flt) {
		return;
	}
	///TEST
	if (flt->getFlightNumber() == "6248") {
		cout << "";
	}
	cout << "add flt " << flt->getDBId() << " " << flt->getFlightNumber() << " " << utcToUtcDtString(flt->getStartTimeLocAct()) << endl;
	time_t fltStartUtc = flt->getStartTimeUtcAct();
	int index = static_cast<int>((fltStartUtc - startUtc) / (60 * minConnectTimeMinutes));
	datas[index].push_back(flt);
	fltIdMap[flt->getDBId()] = flt;
}

void PoAnalysFlightConnect::writeFltGroup(ostream& out) {
	out << "Po analys: flt Groups" << endl;
	for (std::size_t i = 0; i < datas.size(); i++) {
		time_t t = startUtc + 60 * minConnectTimeMinutes * i;
		out << "    Group[" << utcToUtcString(t) << "] size=" << datas[i].size() << endl;
		for (auto& f : datas[i]) {
			out << "       " << f->getFlightNumber()
				<< " " << utcToUtcString(f->getStartTimeUtcAct())
				<< " " << f->getDepSta()
				<< " " << f->getArrSta()
				<< endl;
		}
	}
}
void PoAnalysFlightConnect::writeFltShortConnectCount(ostream& out) {
	vector<Segment*> flts;
	for (auto& it : fltIdMap) {
		flts.push_back(it.second);
	}

	std::sort(flts.begin(), flts.end(),
		[this](Segment* a, Segment* b) {
		return fltShortConnectCount[a->getDBId()] < fltShortConnectCount[b->getDBId()];
	});

	out << "Po analys: flt short-conn count" << endl;
	out << "flt_id, flt_num, STD, dep, arv, count(next short conn)" << endl;
	for (auto& f : flts) {
		out << f->getDBId()
			<< ", " << f->getFlightNumber()
			<< ", " << utcToUtcString(f->getStartTimeUtcAct())
			<< ", " << f->getDepSta()
			<< ", " << f->getArrSta()
			<< ", " << fltShortConnectCount[f->getDBId()]
			<< endl;
	}
}
//存在后续short conn 为 0的航站
void PoAnalysFlightConnect::writeAirportNeedLongTransitOrLayover(ofstream& out) {
	
	map<string, int> airportOfFltArvWithZeroNextFlt;
	for (auto& it : this->fltShortConnectCount) {
		if (it.second == 0) {
			auto& flt = this->fltIdMap[it.first];
			airportOfFltArvWithZeroNextFlt[flt->getArrSta()] = airportOfFltArvWithZeroNextFlt[flt->getArrSta()] + 1;
		}
	}
	//
	//sort
	vector<string> airports;
	for (auto& it : airportOfFltArvWithZeroNextFlt) {
		airports.push_back(it.first);
	}
	sort(airports.begin(), airports.end(), [&](string& a, string& b) {
		return airportOfFltArvWithZeroNextFlt[a] > airportOfFltArvWithZeroNextFlt[b];
	});


	out << "Po analys: airport with no-short-connect-flt exist" << endl;
	out << "airport, count(no-short-connect-flt)" << endl;
	for (auto& arp : airports) {
		out << arp << "," << airportOfFltArvWithZeroNextFlt[arp] << endl;
	}

}


class POAnalysRuleParam {

public:
	POAnalysRuleParam(vector<DBRule>& rules);
	void writeResult();
	bool check3001_wilecard();
	bool check2019_wilecard();
private:
	vector<DBRule> rules;
};

POAnalysRuleParam::POAnalysRuleParam(vector<DBRule>& rules) {
	this->rules = rules;
}

bool POAnalysRuleParam::check3001_wilecard() {
	//
	//单行，全通配
	bool foundSingle = false;
	for (auto& item : rules) {
		if (item.function != 3001) {
			continue;
		}
		if (item.rowNum != 1) {
			continue;
		}
		bool isAllWildcard = true;
		for (auto& it : item.params) {
			if ("MCT" == it.first)
				continue;
			if (it.second != "" && it.second != "*") {
				isAllWildcard = false;
			}
		}
		if (isAllWildcard) {
			foundSingle = true;
		}
		break;
	}
	if (foundSingle) {
		return foundSingle;
	}
	//
	//两行，AC change分别 Y/N
	bool foundRowY = false;
	bool foundRowN = false;
	for (auto& item : rules) {
		if (item.function != 3001) {
			continue;
		}
		bool isAllWildcard = true;
		string paramNameAcChange = strToUpper("Aircraft Change");
		for (auto& it : item.params) {
			if ("MCT" == it.first)
				continue;
			if (it.first != paramNameAcChange && it.second != "" && it.second != "*") {
				isAllWildcard = false;
			}
		}
		if (isAllWildcard) {
			if (item.params[paramNameAcChange] == "Y")
				foundRowY = true;
			else
				foundRowN = true;
		}
	}
	return foundRowY && foundRowN;
}

bool POAnalysRuleParam::check2019_wilecard() {
	bool found = false;
	for (auto& item : rules) {
		if (item.function != 2019) {
			continue;
		}
		if (item.rowNum != 1) {
			continue;
		}
		if (item.params.end() == item.params.find("AIRPORT")) {
			continue;
		}
		found = item.params["AIRPORT"] == "" || item.params["AIRPORT"] == "*";
		break;
	}
	return found;
}
void POAnalysRuleParam::writeResult() {
	bool result3001 = check3001_wilecard();
	bool result2019 = check2019_wilecard();
	ofstream f("analys_rule_parameter.txt");
	f << "2019 wildcard row: " << (result2019 ? "OK" : "not found") << endl;
	f << "3001 wildcard row: " << (result3001 ? "OK" : "not found") << endl;

	f.close();
}


int RuleTool::doPoAnalys(long long scenarioId, int minLTMinutes, int minLOMinutes) {
	int ret = 0;
	
	ret = dbData->loadDataPO(scenarioId);
	if (ret != 0) {
		return ret;
	}

	vector<Segment*> flights;
	if (!dbData->flightList.empty()) {
		for (auto& f : dbData->flightList)
			flights.push_back(f.get());
	}
	else {
		for (auto& f : dbData->pairingInputFlights) {
			flights.push_back(&f);
		}
	}

	//LT
	PoAnalysFlightConnect ctxLT(dbData->startUtc, dbData->endUtc, minLTMinutes, flights);
	ctxLT.process();
	ctxLT.writeResult();
	ctxLT.writeResultLT();

	//LO
	PoAnalysFlightConnect ctxLO(dbData->startUtc, dbData->endUtc, minLOMinutes, flights);
	ctxLO.process();
	ctxLO.writeResultLO();

	//ruleParams: wildcard 3001, 2019
	POAnalysRuleParam ruleCheck(dbData->ruleList);
	ruleCheck.writeResult();

	return ret;
}
