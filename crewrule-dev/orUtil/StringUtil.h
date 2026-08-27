#include <string>
#include <vector>
#include <set>
using namespace std;

//判断str是否整数
bool isDigitStr(const char * str, std::size_t len);
//判断str是否整数或小数
bool isNumberStr(const char * str, std::size_t len);
//str: 解析目标str
//default: 若str不是合法整数，则返回default
//return: str为空，返回default; str太长，返回default; str包含非数字字母，返回default
//int strToInt(const char * str, int defaultValue);
int strToInt(string str, int defaultVal);

string llToStr(const long long value);

string trim(const string& str);
string replace(const string& str, const string& src, const string& dest);
int split(const string& str, vector<string>& ret_, string sep);
void split(const char * input, char delim, vector<string> &result);
void split(const char * input, char delim, std::set<string> &result);
void split(const char * input, char delim, std::map<string, int> &map);

void splitWithCache(string str, char delim, vector<string>& result);
const vector<string>& splitWithCache(string str, char delim);
vector<string>* splitWithCachePtr(string str, char delim); //avoid vector copy

bool isEndsWith(std::string const & value, std::string const & ending);
bool isEndsWith(std::string const & value, const char* ending);

void strToupper(char* buf, int size);
string strToUpper(string str);
string strToLower(string str);
string toUpper(string s);
string toLower(string s);

// 在字符串左侧补足指定字符至指定总宽度
std::string padLeft(const std::string& str, const size_t totalWidth, const char fillChar);