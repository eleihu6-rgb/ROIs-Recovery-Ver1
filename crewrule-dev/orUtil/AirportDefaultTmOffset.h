/*
1 维护机场默认时区
2 运行时，若数据源读入airport存在，则以数据源 airport对象为准
3 运行时，若数据源读入airport不存在，则以下面默认时区（minutes）为准
	PEK,480
	URO,60
	URY,180
	USH,-180
	USK,180
	USL,480
	USM,420
	USN,540
4 用法
	if (AirportDefaultOffset::instance().isDefaultExist(airport)) {
		int hour = AirportDefaultOffset::instance().getOffsetHour(airport);
		cout << "default airport '" << airport << "' offset " << hour<< endl;
*/

#ifndef AIRPORT_DEFAULT_OFFEST_H
#define AIRPORT_DEFAULT_OFFEST_H
#include <string>
#include <map>

class AirportDefault {
public:
	static AirportDefault& instance();
	std::string getCountry(std::string airport);
	int getOffsetMinutes(std::string airport);
	double getOffsetHour(std::string airport);
	bool isDefaultExist(std::string airport);

private:
	void initDefaultAiportOffsetMinutes();
	void initDefaultCountry();
	std::map<std::string, int> _defaultAiportOffsetMinutes;
	std::map<std::string, std::string> _defaultAiportCountry;
	std::map<std::string, bool> _warnedAirport;//避免重复冗余警告
};


#endif//AIRPORT_DEFAULT_OFFEST_H