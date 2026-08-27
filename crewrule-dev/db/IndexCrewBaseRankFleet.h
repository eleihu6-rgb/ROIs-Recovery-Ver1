#ifndef INDEX_CREW_BASE_RANK_FLEET_H
#define INDEX_CREW_BASE_RANK_FLEET_H
#include <vector>
#include <map>
#include <unordered_map>
#include <memory>
#include <string>
#include "time.h"
using namespace std;
/*
IndexCrewBaseRankFleetDayItem:
1 index，用于判断每一天是否具有指定base rank fleet qual等资格
2 按日期维护，每天对应一个 IndexCrewBaseRankFleetDayItem
3 IndexCrewBaseRankFleetDayItem中通过 valuename找到 bit offset，并通过buf -> bit: true/false判断是否具有资格
*/

class IndexCrewBaseRankFleetDayItemConfig {
public:
	void init(string& type, vector<string>& valueList);
	map<string, shared_ptr<map<string, int>>> valueBitOffset;
	int maxBitIndex = 0;
};

/*
1 根据buf中 bit offset按 true/false维护每日具有哪些 base rank fleet qual
2 需要先调用init初始化 bitOffset列表
*/
class IndexCrewBaseRankFleetDayItem {
public:
	IndexCrewBaseRankFleetDayItem(shared_ptr<IndexCrewBaseRankFleetDayItemConfig>& config);
	~IndexCrewBaseRankFleetDayItem();
	//static void init(string& type, vector<string>& valueList);
	bool hasValue(string& type, string& v);
	void setValue(string& type, string& v);
	string& getBase();
	map<string, shared_ptr<map<string, int>>>& getValueBitOffset();
private:
	unsigned char* buf = nullptr;
	int bufsize = 0;
	int timezoneOfDay = 0; //根据crewbase确定当日本地时区
	string base; //当天base
	shared_ptr<IndexCrewBaseRankFleetDayItemConfig> config;
	//static map<string, shared_ptr<map<string, int>>> valueBitOffset;
	//static int maxBitIndex;
};

/*
1 封装base fleet rank日期索引
2 核心接口：isValueExistOnDt()，判断指定日期是否具有制定value
3 需要先调用 init()初始化 rank/fleet/base/...全集合，并计算IndexCrewBaseRankFleetDayItem中value bit offset
4 主要接口：
  分别按参数类型 local/utc时间判断 base rank fleet qual是否具有资格
	bool isBaseValueExistByLocal(string& value, time_t loc);
	bool isRankValueExistByLocal(string& value, time_t loc);
	bool isFleetValueExistByLocal(string& value, time_t loc);
	bool isQualValueExistByLocal(string& value, time_t loc);
	bool isBaseValueExistByUtc(string& value, time_t utc);
	bool isRankValueExistByUtc(string& value, time_t utc);
	bool isFleetValueExistByUtc(string& value, time_t utc);
	bool isQualValueExistByUtc(string& value, time_t utc);
*/
class IndexCrewBaseRankFleet {
public:
	IndexCrewBaseRankFleet(time_t startDt, time_t endDt, shared_ptr<IndexCrewBaseRankFleetDayItemConfig>& config);
	~IndexCrewBaseRankFleet();
	static void init(unordered_map<string, int>& airportUtcOffsetMap);
	static void init(string& type, vector<string>& valueList);
	bool isBaseValueExistByLocal(string& value, time_t loc);
	bool isRankValueExistByLocal(string& value, time_t loc);
	bool isFleetValueExistByLocal(string& value, time_t loc);
	bool isQualValueExistByLocal(string& value, time_t loc);
	bool isBaseValueExistByUtc(string& value, time_t utc);
	bool isRankValueExistByUtc(string& value, time_t utc);
	bool isFleetValueExistByUtc(string& value, time_t utc);
	bool isQualValueExistByUtc(string& value, time_t utc);
	void addIndexValue(string& type, string& value, time_t startDtLoc, time_t endDtLoc); //eg. value=CA startDt=eff_dt endDt=exp_dt (or 9999-12-31 for null)
	void printLog();
private:
	bool isValueExistOnLocal(string& type, string& value, time_t loc);
	bool isValueExistOnUtc(string& type, string& value, time_t utc);
	vector<IndexCrewBaseRankFleetDayItem*> dateIndexList;
	time_t indexStartDtLoc = 0; //00:00 of leadin start dt
	static unordered_map<string, int> airportUtcOffsetMap;
};


#endif//INDEX_CREW_BASE_RANK_FLEET_H