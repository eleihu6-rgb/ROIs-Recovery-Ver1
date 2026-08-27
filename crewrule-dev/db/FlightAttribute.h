#ifndef FLIGHT_ATTRIBUTE_H
#define FLIGHT_ATTRIBUTE_H
#include <vector>
#include <map>
#include <string>
#include <exception>
using namespace std;

/*
  FlightAttribute
  1 描述航班属性，如是否特殊机场、是否外籍必飞等
  2 因各个航空公司定义attribute各不相同，因此使用动态方式实现
    buf中每个byte的每一个二进制位代表一个attribute，二进制1表示true，二进制0表示false
  3 每个属性对应buf中第几个byte的第几个二进制位，由attrNameIndexMap维护，此为static map
    map的key为属性名称，map的value为属性索引(index)
	属性对应buf中第 (index/8)个byte内第 (index%8)个二进制位
  4 下述为已知attributeName定义，可用于 FlightAttribute::setAttribute/getAttribute参数
    如
	  FlightAttribute fa;
	  fa.setAttribute(ATTR_NAME_ROUTE_1A);
	  bool hasRoute1A = fa.getAttribute(ATTR_NAME_ROUTE_1A);
 */
#define ATTR_NAME_ROUTE_1A           "1A"
#define ATTR_NAME_ROUTE_1B           "1B"
#define ATTR_NAME_ROUTE_2A           "2A"
#define ATTR_NAME_ROUTE_2B           "2B"

#define ATTR_NAME_ROUTE_ALLOW_EXPAT  "A"
#define ATTR_NAME_ROUTE_MUST_EXPAT   "M"
#define ATTR_NAME_ROUTE_ICAO         "C"

#define ATTR_NAME_EXPAT_ALLOW        "EXPAT_ALLOW"
#define ATTR_NAME_EXPAT_MUST         "EXPAT_MUST"
#define ATTR_NAME_ICAO               "ICAO"
#define ATTR_NAME_SPECIAL_AIRPORT    "SPECIAL_AIRPORT"
#define ATTR_NAME_REGIONAL           "REGIONAL"
#define ATTR_NAME_PATTERN_US         "1"

class FlightAttribute {
public:
	FlightAttribute();
	FlightAttribute(const FlightAttribute& obj);
	~FlightAttribute();

	//初始化所有attribute
	static void init(vector<string>& nameList);
	static bool isInited();

	//检查指定attr是否设置
	bool getAttribute(string attr);

	//设置/添加指定attr
	void setAttribute(string attr);

	void copyTo(FlightAttribute& obj);

	//返回str描述各attr，如 'F|o|A1' 表示包含3个attr: F o A1
	string toString();

private:
	unsigned char * valueBuf = NULL;
	static map<string, std::size_t> attrNameIndexMap;
};


#endif//FLIGHT_ATTRIBUTE_H