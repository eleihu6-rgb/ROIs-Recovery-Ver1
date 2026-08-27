#ifndef _BASEUTILS_H_
#define _BASEUTILS_H_

#include <vector>
#include "CrewDB.h"

using namespace std;

/**
	基地工具类
*/
class BaseUtils {

public:
	/**
	* 判断Duty/Segment的落地机场/起飞机场，是否在基地base
	* @param duty: Duty
	* @param baseList: 所有基地列表
	* @param filiale: 航空公司
	*/
	static bool IsHomeBase(const std::string& station, const vector<BASE>& baseList, const std::string& filiale);

	/**
	* 判断Duty/Segment的落地机场/起飞机场，是否在基地base
	* @param duty: Duty
	* @param baseList: 所有基地列表
	* @param base: Duty判断是否在该基地
	*/
	static bool IsHomeBaseByBase(const std::string& station, const vector<string>& baseList, const std::string& base);

	static std::string GetCrewPrimaryBase(const CREW& crew, const time_t& startUtc);
};

#endif //_BASEUTILS_H_