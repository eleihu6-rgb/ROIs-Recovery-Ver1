#ifndef RECENCY_MGR_H
#define RECENCY_MGR_H
#include <string>
#include <memory>
#include <map>
#include <vector>
#include <unordered_map>

using namespace std;

//1、数据结构分为三级
//2、第一级, map<crewId>
//3、第二级, unordered_map, 按crewId/dep/arv/fleet/role/actingRank分类，通过自定义hash/equal实现
//4、第三级, 相同分类按utc顺序保存vector
class CrewRecency;
class CrewRecencyRules;
class CrewFleetRecency;
class CrewPortRecency;
class RecencyMapWithHashAndEqual;
class CrewDataContext;
class RecencyMgr {
	friend class CrewDataContext;
public:
	void initCrewRecency(vector<shared_ptr<CrewRecency>>& list);
	time_t getLastestRecencyBeforeUtc(time_t utc, string crewId, string dep, string arv, string fleet, string actingRank, string role);
	map<string, RecencyMapWithHashAndEqual>& getRecencyMap();
	void addRecency(shared_ptr<CrewRecency>& item);
	void removeRecency(time_t utc, string crewId, string dep, string arv, string fleet, string actingRank, string role);
	void removeRecencyNotInScenario(long long scenarioId);
	void removeRecencyByRoster(string crewId, long long rosterId);
	void updateRosterId(string crewId, long long oldId, long long newId);
	vector<shared_ptr<CrewRecency>> getByCrewId(string crewId);
	void print();

	void setCrewRecencyRules(vector<shared_ptr<CrewRecencyRules>>& list) { _crewRecencyRules.swap(list); }
	vector<shared_ptr<CrewRecencyRules>>& getCrewRecencyRules() { return _crewRecencyRules; }

	void initCrewFleetRecency(vector<shared_ptr<CrewFleetRecency>>& list);
	unordered_map<string, vector<shared_ptr<CrewFleetRecency>>>& getCrewFleetRecency() { return _crewFleetRecencyMap; }

	void initCrewPortRecency(vector<shared_ptr<CrewPortRecency>>& list);
	unordered_map<string, vector<shared_ptr<CrewPortRecency>>>& getCrewPortRecency() { return _crewPortRecencyMap; }

private:
	map<string, RecencyMapWithHashAndEqual> recencyMap; //自定义hash/equal
	unordered_map<string, vector<shared_ptr<CrewRecency>>> crewIndex;
	vector<shared_ptr<CrewRecencyRules>> _crewRecencyRules;
	unordered_map<string, vector<shared_ptr<CrewFleetRecency>>> _crewFleetRecencyMap;
	unordered_map<string, vector<shared_ptr<CrewPortRecency>>> _crewPortRecencyMap;
};

//recency
class CrewRecency {
public:
	long long scenarioId = 0;
	string idcrew;
	time_t crewDateLoc = 0; //local time of program execute, eg: PEK,TPE,SZX,...
	time_t crewDateUtc = 0;
	string depAirport;
	string arvAirport;
	string operate;
	string status;
	string fleet;
	string approach;
	string unit;
	int times = 0;
	string role;
	string actingRank;
	long long rosterId = 0;
	long long trainingId = 0;
	string remark;
	string iduser;
	time_t tmst = 0;
	string type;
	string code;
	time_t effDt = 0;
	time_t expDt = 0;
	bool isFilled = false;
	void copy(CrewRecency* other);
};

//recency rules
class CrewRecencyRules {
public:
	long long id = 0;
	string recencyType;
	string qualification;
	int qualExpDay = 0;
	string assignments;
	string attributes;
	int minPtns = 0;                //要分几个pattern。需要保持资质的话，最少设一个。有时甚至2个甚至更多，是为了保险起见。万一在tracking阶段，一个pattern被取消，还可以有备选
	int space = 0;                 //同一类型的pattern之间，需要间隔几天
	bool byRank = false;
	void copy(CrewRecencyRules* other);
};

class CrewFleetRecency {
public:
	long long id = 0;
	string crewId;
	string fleetSpecific;
	time_t effDt = 0;
	time_t expDt = 0;
	string acType;
	string fleetGrp;
	void copy(CrewFleetRecency* other);
};

class CrewPortRecency {
public:
	long long id = 0;
	string crewId;
	string qualification;
	string airport;
	time_t effDt = 0;
	time_t expDt = 0;
	time_t lastModified = 0;
	string modifiedBy;
	void copy(CrewPortRecency* other);
};

//自定义hash/equal
class RecencyHash {
public:	size_t operator() (shared_ptr<CrewRecency> const& key) const;
};
class RecencyEqual {
public:	bool operator() (shared_ptr<CrewRecency> const& t1, shared_ptr<CrewRecency> const& t2) const;
};
class RecencyMapWithHashAndEqual :
	public unordered_map<
		shared_ptr<CrewRecency>,
		vector<shared_ptr<CrewRecency>>,
		RecencyHash,
		RecencyEqual > {};

#endif//RECENCY_MGR_H
