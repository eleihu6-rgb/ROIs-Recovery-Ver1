
#include "rapidjson/document.h"		// rapidjson's DOM-style API
#include "rapidjson/prettywriter.h"	// for stringify JSON
#include "rapidjson/filestream.h"	// wrapper of C stream for prettywriter as output
#include "rapidjson/stringbuffer.h"	// wrapper of C stream for prettywriter as output
#include "JsonParser.h"
#include "JsonUtil.h"
#include "UtilFunc.h"

using namespace rapidjson;

#define SUCCESS    0
#define ERR_DATA   1
#define ERR_PARAM  2
#define ERR_FILE   5
#define ERR_UNKNOWN 99

#define SET_ERR_HANDLE(err,msg) this->errorCode=err;this->errorMsg=msg;



//*********************************************************************
//从指定def定义文件创建json解析器
//*********************************************************************
JsonParser::JsonParser(JsonParserItem * jsonInterface) {

	this->errorCode = 0;
	this->errorMsg = "";
	this->jsonInterface = jsonInterface;

}

//*********************************************************************
//上一次操作是否成功
//*********************************************************************
bool JsonParser::isSuccess() {	return (this->errorCode == 0); }
string JsonParser::getErrorMsg() { return this->errorMsg; }
long   JsonParser::getErrorCode() { return this->errorCode; }

vector<void*> JsonParser::getList() { return this->list; }
//*********************************************************************
//按def定义读取指定json文件，解析为T类型vector
//*********************************************************************

void JsonParser::readJson(const char* dataFile, vector<void*>& outList) {
	Document document;

	string ret = readJsonFile(dataFile, document);
	if (ret != "success") {
		SET_ERR_HANDLE(ERR_PARAM, ret);
		return ;
	}


	for (SizeType i = 0; i < document.Size(); i++) {
		Value &docItem = document[i]; 
		void * obj = parseJsonToObj(docItem, this->jsonInterface);
		if (obj == NULL) {
			SET_ERR_HANDLE(ERR_DATA, "解析json对象失败，parseJsonToObj()返回NULL");
			return;
		}
		outList.push_back(obj);
	}
	this->list.clear();
	this->list.insert(this->list.begin(), outList.begin(), outList.end());
}

//*********************************************************************
//按def定义将T类型vector保存到 指定json文件
//*********************************************************************

void JsonParser::writeJson(vector<void*>& list, const char* filepath) {

	Document doc;
	//rapidjson::Document::AllocatorType &allocator = doc.GetAllocator();
		
	doc.SetArray();
	//Value docArray(kArrayType);
	for (std::size_t i = 0; i < list.size(); i++) {
		Value value;
		value.SetObject();

		void * obj = list[i];

		parseObjToJson(obj, value, this->jsonInterface, doc.GetAllocator());
		doc.PushBack(value, doc.GetAllocator());
	}
	//doc.AddMember("array", docArray, doc.GetAllocator());


	// Write std output
	//rapidjson::StringBuffer jsonOutput;
	//rapidjson::PrettyWriter< rapidjson::StringBuffer > jsonWriter(jsonOutput);
	//doc.Accept(jsonWriter);
	//printf("JSON string: %s\n", jsonOutput.GetString());

	// Write file
	FILE* fp = fopen(filepath, "wb");
	FileStream s(fp);
	PrettyWriter<FileStream> writer(s);
	doc.Accept(writer);
	fclose(fp);

	if (doc.HasParseError()) {
		SET_ERR_HANDLE(ERR_DATA, doc.GetParseError());
	}
}